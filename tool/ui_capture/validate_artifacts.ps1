[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$CapturePath,
    [string]$InventoryPath = 'docs/design-handoff/placeholder-app/visual-state-inventory.json'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

function Resolve-RepoPath {
    param([Parameter(Mandatory)][string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) { return $Path }
    return Join-Path $repoRoot $Path
}

function Read-RequiredJson {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Description
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Description not found at $Path"
    }
    try {
        return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
    }
    catch {
        throw "$Description is not valid JSON at $Path`: $($_.Exception.Message)"
    }
}

function Get-PngDimensions {
    param([Parameter(Mandatory)][string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    if ($bytes.Length -lt 24) { throw "PNG is too short: $Path" }
    for ($index = 0; $index -lt $signature.Length; $index++) {
        if ($bytes[$index] -ne $signature[$index]) {
            throw "Invalid PNG signature: $Path"
        }
    }
    $width = ([int64]$bytes[16] -shl 24) -bor
        ([int64]$bytes[17] -shl 16) -bor
        ([int64]$bytes[18] -shl 8) -bor
        [int64]$bytes[19]
    $height = ([int64]$bytes[20] -shl 24) -bor
        ([int64]$bytes[21] -shl 16) -bor
        ([int64]$bytes[22] -shl 8) -bor
        [int64]$bytes[23]
    if ($width -le 0 -or $height -le 0) {
        throw "PNG has invalid IHDR dimensions: $Path"
    }
    return [pscustomobject]@{ width = [int]$width; height = [int]$height }
}

$captureAbsolute = Resolve-RepoPath $CapturePath
if (-not (Test-Path -LiteralPath $captureAbsolute -PathType Container)) {
    throw "Capture folder not found at $captureAbsolute"
}

$pngs = @(Get-ChildItem -LiteralPath $captureAbsolute -File -Filter '*.png')
if ($pngs.Count -ne 38) {
    throw "Expected exactly 38 PNG files in $captureAbsolute; found $($pngs.Count)."
}
$metadataFiles =
    @(Get-ChildItem -LiteralPath $captureAbsolute -File -Filter '*.meta.json')
if ($metadataFiles.Count -ne 38) {
    throw "Expected exactly 38 meta JSON files in $captureAbsolute; found $($metadataFiles.Count)."
}

$buildManifestPath = Join-Path $captureAbsolute 'build-manifest.json'
$build = Read-RequiredJson $buildManifestPath 'Build manifest'
$requiredBuildFields = @(
    'buildHash', 'apkHash', 'sourceFingerprint', 'deviceId', 'deviceModel',
    'viewportWidth', 'viewportHeight'
)
foreach ($field in $requiredBuildFields) {
    if ($build.PSObject.Properties.Name -notcontains $field -or
        [string]::IsNullOrWhiteSpace($build.$field.ToString())) {
        throw "Build manifest is missing required field '$field'."
    }
}

$inventory = Read-RequiredJson (Resolve-RepoPath $InventoryPath) 'Visual-state inventory'
$expectedByKey = @{}
foreach ($state in $inventory.states) {
    foreach ($theme in @('dark', 'light')) {
        $key = "$($state.id)--$theme"
        if ($expectedByKey.ContainsKey($key)) {
            throw "Duplicate canonical state key in inventory: $key"
        }
        $expectedByKey[$key] = $state.fixtureProfile
    }
}
if ($expectedByKey.Count -ne 38) {
    throw "Visual-state inventory must define exactly 38 state/theme keys; found $($expectedByKey.Count)."
}

$pngByKey = @{}
foreach ($png in $pngs) {
    $key = [IO.Path]::GetFileNameWithoutExtension($png.Name)
    if ($pngByKey.ContainsKey($key)) { throw "Duplicate PNG state key: $key" }
    $pngByKey[$key] = $png
}
$metadataByKey = @{}
foreach ($file in $metadataFiles) {
    $key = $file.Name.Substring(0, $file.Name.Length - '.meta.json'.Length)
    if ($metadataByKey.ContainsKey($key)) { throw "Duplicate metadata state key: $key" }
    $metadataByKey[$key] = $file
}

$missingPng = @($expectedByKey.Keys | Where-Object { -not $pngByKey.ContainsKey($_) })
$extraPng = @($pngByKey.Keys | Where-Object { -not $expectedByKey.ContainsKey($_) })
$missingMeta = @($expectedByKey.Keys | Where-Object { -not $metadataByKey.ContainsKey($_) })
$extraMeta = @($metadataByKey.Keys | Where-Object { -not $expectedByKey.ContainsKey($_) })
if ($missingPng.Count -or $extraPng.Count -or $missingMeta.Count -or $extraMeta.Count) {
    throw "Artifact state-key mismatch. missingPng=$($missingPng -join ',') extraPng=$($extraPng -join ',') missingMeta=$($missingMeta -join ',') extraMeta=$($extraMeta -join ',')"
}

$requiredMetadataFields = @(
    'screen', 'route', 'deepLink', 'theme', 'fixtureProfile', 'fixtureHash',
    'sourceFingerprint', 'apkHash', 'buildHash', 'deviceId', 'deviceModel',
    'viewportWidth', 'viewportHeight', 'captureTimestamp',
    'staleBuildFingerprint'
)
$fixtureHashes = @{}
foreach ($key in ($expectedByKey.Keys | Sort-Object)) {
    $metadata = Read-RequiredJson $metadataByKey[$key].FullName "Metadata for $key"
    foreach ($field in $requiredMetadataFields) {
        if ($metadata.PSObject.Properties.Name -notcontains $field) {
            throw "Metadata for $key is missing required field '$field'."
        }
    }
    if ($metadata.buildHash -ne $build.buildHash -or
        $metadata.apkHash -ne $build.apkHash -or
        $metadata.sourceFingerprint -ne $build.sourceFingerprint) {
        throw "Build fingerprint mismatch for $key."
    }
    if ($metadata.deviceId -ne $build.deviceId -or
        $metadata.deviceModel -ne $build.deviceModel) {
        throw "Device identity mismatch for $key."
    }
    if ($metadata.fixtureProfile -ne $expectedByKey[$key]) {
        throw "Fixture profile mismatch for $key`: expected $($expectedByKey[$key]), found $($metadata.fixtureProfile)."
    }
    if ([string]::IsNullOrWhiteSpace($metadata.fixtureHash)) {
        throw "Fixture hash is empty for $key."
    }
    if ($metadata.staleBuildFingerprint -ne $false) {
        throw "Capture $key is marked with a stale build fingerprint."
    }
    $dimensions = Get-PngDimensions $pngByKey[$key].FullName
    if ($dimensions.width -ne [int]$metadata.viewportWidth -or
        $dimensions.height -ne [int]$metadata.viewportHeight -or
        $dimensions.width -ne [int]$build.viewportWidth -or
        $dimensions.height -ne [int]$build.viewportHeight) {
        throw "Viewport/IHDR mismatch for $key`: PNG=$($dimensions.width)x$($dimensions.height), metadata=$($metadata.viewportWidth)x$($metadata.viewportHeight), build=$($build.viewportWidth)x$($build.viewportHeight)."
    }
    $profile = $metadata.fixtureProfile
    if ($fixtureHashes.ContainsKey($profile) -and
        $fixtureHashes[$profile] -ne $metadata.fixtureHash) {
        throw "Fixture hash is inconsistent within profile '$profile'."
    }
    $fixtureHashes[$profile] = $metadata.fixtureHash
}

if ($fixtureHashes.Count -ne 9) {
    throw "Expected fixture hashes for exactly 9 profiles; found $($fixtureHashes.Count)."
}
$distinctHashes = @($fixtureHashes.Values | Sort-Object -Unique)
if ($distinctHashes.Count -ne $fixtureHashes.Count) {
    throw 'Fixture profiles must have distinct fixture hashes.'
}

[pscustomobject]@{
    valid = $true
    capturePath = $captureAbsolute
    pngCount = $pngs.Count
    metadataCount = $metadataFiles.Count
    fixtureProfileCount = $fixtureHashes.Count
    buildHash = $build.buildHash
    apkHash = $build.apkHash
    viewportWidth = [int]$build.viewportWidth
    viewportHeight = [int]$build.viewportHeight
} | ConvertTo-Json -Depth 5
