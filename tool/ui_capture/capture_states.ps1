[CmdletBinding()]
param(
    [string[]]$Screens = @('all'),
    [ValidateSet('dark', 'light')]
    [string[]]$Themes = @('dark', 'light'),
    [switch]$Execute,
    [string]$DeviceId,
    [string]$OutputRoot = '.ui-diff/captures',
    [string]$BuildMetadataPath = '',
    [string]$InventoryPath = 'docs/design-handoff/placeholder-app/visual-state-inventory.json',
    [int]$ReadyTimeoutSeconds = 90,
    [long]$FixtureEpochMs = 1778846400000
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

$canonicalScreens = @(
    'loading', 'login', 'permission', 'scan_idle', 'scan_capturing',
    'processing', 'review', 'manual', 'today', 'today_empty', 'food',
    'food_edit', 'history_week', 'history_month', 'goals', 'goals_select',
    'ai', 'ai_history', 'profile'
)

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $stream.Dispose()
        $sha.Dispose()
    }
}

function Get-BuildRelevantFiles {
    $trackedAndUntracked = @(& git ls-files --cached --others --exclude-standard)
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }

    $declaredAssetRoots = @()
    foreach ($line in Get-Content -LiteralPath (Join-Path $repoRoot 'pubspec.yaml')) {
        if ($line -match '^\s+-\s+(assets/[^#]+?)(?:\s+#.*)?$') {
            $declaredAssetRoots += $Matches[1].Trim().TrimEnd('/') + '/'
        }
    }

    $platformConfig = '^(android|ios|linux|macos|web|windows)/.*(gradle|properties|xml|plist|xcconfig|pbxproj|json|yaml|yml|cmake|cpp|h|html|js|kts|kt|swift)$'
    return @($trackedAndUntracked | Where-Object {
        $path = $_ -replace '\\', '/'
        $isDeclaredAsset = $false
        foreach ($root in $declaredAssetRoots) {
            if ($path.StartsWith($root, [StringComparison]::Ordinal)) {
                $isDeclaredAsset = $true
                break
            }
        }
        $path.StartsWith('lib/', [StringComparison]::Ordinal) -or
            $isDeclaredAsset -or
            $path -in @('pubspec.yaml', 'pubspec.lock') -or
            $path -match $platformConfig
    } | Sort-Object -Unique)
}

function Get-SourceFingerprint {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        foreach ($relative in Get-BuildRelevantFiles) {
            $absolute = Join-Path $repoRoot $relative
            if (-not (Test-Path -LiteralPath $absolute -PathType Leaf)) { continue }
            $pathBytes = [Text.Encoding]::UTF8.GetBytes(($relative -replace '\\', '/') + "`0")
            [void]$sha.TransformBlock($pathBytes, 0, $pathBytes.Length, $null, 0)
            $bytes = [IO.File]::ReadAllBytes($absolute)
            [void]$sha.TransformBlock($bytes, 0, $bytes.Length, $null, 0)
            $separator = [byte[]](0)
            [void]$sha.TransformBlock($separator, 0, 1, $null, 0)
        }
        [void]$sha.TransformFinalBlock([byte[]]::new(0), 0, 0)
        return ([BitConverter]::ToString($sha.Hash)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
}

function Resolve-RepoPath {
    param([Parameter(Mandatory)][string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) { return $Path }
    return Join-Path $repoRoot $Path
}

function Get-ViewportSize {
    param([Parameter(Mandatory)][string]$WmSize)
    $matches = [Regex]::Matches($WmSize, '(\d+)x(\d+)')
    if ($matches.Count -eq 0) { throw "Unable to parse adb wm size output: $WmSize" }
    $match = $matches[$matches.Count - 1]
    return [pscustomobject]@{
        width = [int]$match.Groups[1].Value
        height = [int]$match.Groups[2].Value
    }
}

function Assert-ExplicitPhysicalDevice {
    if ([string]::IsNullOrWhiteSpace($DeviceId)) {
        throw '-Execute requires an explicit -DeviceId <serial>.'
    }
    if ($DeviceId.StartsWith('emulator-', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Emulator targets are not allowed for this capture: $DeviceId"
    }
    $devices = @(& adb devices)
    if ($LASTEXITCODE -ne 0) { throw 'adb devices failed.' }
    $connected = $devices | Where-Object { $_ -match "^$([Regex]::Escape($DeviceId))\s+device$" }
    if (-not $connected) {
        throw "Explicit device '$DeviceId' is not connected in adb device state."
    }
}

function Invoke-AdbText {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $output = & adb -s $DeviceId @Arguments
    if ($LASTEXITCODE -ne 0) { throw "adb failed: $($Arguments -join ' ')" }
    return ($output -join "`n").Trim()
}

function Save-AdbScreenshot {
    param([Parameter(Mandatory)][string]$Path)
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'adb'
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    foreach ($arg in @('-s', $DeviceId, 'exec-out', 'screencap', '-p')) {
        [void]$startInfo.ArgumentList.Add($arg)
    }
    $process = [Diagnostics.Process]::Start($startInfo)
    $stream = [IO.File]::Create($Path)
    try { $process.StandardOutput.BaseStream.CopyTo($stream) }
    finally { $stream.Dispose() }
    $errorText = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw "adb screencap failed: $errorText" }
}

$requestedScreens = if ($Screens -contains 'all') { $canonicalScreens } else { @($Screens) }
$unknown = @($requestedScreens | Where-Object { $_ -notin $canonicalScreens })
if ($unknown.Count -gt 0) { throw "Unknown screen IDs: $($unknown -join ', ')" }

$inventoryAbsolute = Resolve-RepoPath $InventoryPath
$inventory = Read-JsonFile $inventoryAbsolute
if ($null -eq $inventory) { throw "Visual-state inventory not found at $inventoryAbsolute" }
$inventoryByScreen = @{}
foreach ($state in $inventory.states) {
    $inventoryByScreen[$state.id] = $state
}
foreach ($screen in $canonicalScreens) {
    if (-not $inventoryByScreen.ContainsKey($screen)) {
        throw "Visual-state inventory is missing canonical screen '$screen'."
    }
}

$dateFolder = Join-Path $repoRoot (Join-Path $OutputRoot ([DateTime]::UtcNow.ToString('yyyy-MM-dd')))
$buildMetadataAbsolute = if ([string]::IsNullOrWhiteSpace($BuildMetadataPath)) {
    Join-Path $dateFolder 'build-manifest.json'
} else {
    Resolve-RepoPath $BuildMetadataPath
}
$sourceFingerprint = Get-SourceFingerprint
$apkPath = Join-Path $repoRoot 'build/app/outputs/flutter-apk/app-debug.apk'
$apkHash = Get-Sha256Hex $apkPath
$previousBuild = Read-JsonFile $buildMetadataAbsolute
$buildIsFresh = $null -ne $previousBuild -and
    $previousBuild.sourceFingerprint -eq $sourceFingerprint -and
    $null -ne $apkHash -and
    $previousBuild.apkHash -eq $apkHash -and
    $previousBuild.deviceId -eq $DeviceId

$plans = foreach ($screen in $requestedScreens) {
    foreach ($theme in $Themes) {
        $nonce = [Guid]::NewGuid().ToString('N')
        $deepLink = "calorix://debug/reseed?screen=$screen&theme=$theme&nonce=$nonce&fixtureEpochMs=$FixtureEpochMs"
        [pscustomobject]@{
            screen = $screen
            theme = $theme
            nonce = $nonce
            fixtureEpochMs = $FixtureEpochMs
            fixtureProfile = $inventoryByScreen[$screen].fixtureProfile
            deepLink = $deepLink
            adbDeepLinkArgument = "'$deepLink'"
            outputPng = Join-Path $dateFolder "$screen--$theme.png"
            outputMetadata = Join-Path $dateFolder "$screen--$theme.meta.json"
            sourceFingerprint = $sourceFingerprint
            apkHash = $apkHash
            freshnessDecision = if ($buildIsFresh) { 'reuse-installed-build' } else { 'rebuild-and-install' }
            execute = [bool]$Execute
            deviceId = $DeviceId
        }
    }
}

if (-not $Execute) {
    [pscustomobject]@{
        mode = 'plan-only'
        sourceFingerprint = $sourceFingerprint
        apkHash = $apkHash
        buildIsFresh = $buildIsFresh
        buildManifestPath = $buildMetadataAbsolute
        actions = @($plans)
    } | ConvertTo-Json -Depth 8
    exit 0
}

Assert-ExplicitPhysicalDevice
$buildFreshSkippedRebuild = $buildIsFresh
if (-not $buildIsFresh) {
    & fvm flutter build apk --debug
    if ($LASTEXITCODE -ne 0) { throw 'Flutter debug APK build failed.' }
    $apkHash = Get-Sha256Hex $apkPath
    if ($null -eq $apkHash) { throw "Built APK not found at $apkPath" }
    & adb -s $DeviceId install -r $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'APK install failed.' }
} else {
    Write-Host 'build fresh, skipped rebuild'
}

$buildHash = (& git rev-parse HEAD).Trim()
$deviceModel = Invoke-AdbText @('shell', 'getprop', 'ro.product.model')
$pixelSize = Invoke-AdbText @('shell', 'wm', 'size')
$viewport = Get-ViewportSize $pixelSize
$metadataParent = Split-Path -Parent $buildMetadataAbsolute
New-Item -ItemType Directory -Force -Path $metadataParent | Out-Null
[pscustomobject]@{
    sourceFingerprint = $sourceFingerprint
    apkHash = $apkHash
    buildHash = $buildHash
    deviceId = $DeviceId
    deviceModel = $deviceModel
    viewportWidth = $viewport.width
    viewportHeight = $viewport.height
    buildFreshSkippedRebuild = $buildFreshSkippedRebuild
    installedAtUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $buildMetadataAbsolute -Encoding utf8

New-Item -ItemType Directory -Force -Path $dateFolder | Out-Null

foreach ($plan in $plans) {
    [void](Invoke-AdbText @('logcat', '-c'))
    [void](Invoke-AdbText @(
        'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
        '-d', $plan.adbDeepLinkArgument, 'com.calorix.calorix'
    ))

    $readyPrefix = "UI_DIFF_READY:$($plan.nonce):$($plan.screen):$($plan.theme):"
    $blockedPrefix = "UI_DIFF_BLOCKED:$($plan.nonce):$($plan.screen):"
    $deadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $readyLine = $null
    while ([DateTime]::UtcNow -lt $deadline) {
        $log = Invoke-AdbText @('logcat', '-d', '-v', 'raw')
        $blocked = @($log -split "`n" | Where-Object { $_.Contains($blockedPrefix) }) | Select-Object -First 1
        if ($blocked) { throw "Capture target blocked: $blocked" }
        $readyLine = @($log -split "`n" | Where-Object { $_.Contains($readyPrefix) }) | Select-Object -First 1
        if ($readyLine) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $readyLine) {
        throw "Timed out waiting for exact ready nonce $($plan.nonce)."
    }
    $fixtureHash = $readyLine.Substring($readyLine.IndexOf($readyPrefix) + $readyPrefix.Length).Trim()
    Save-AdbScreenshot $plan.outputPng
    [pscustomobject]@{
        screen = $plan.screen
        route = "/debug/capture/$($plan.screen)"
        deepLink = $plan.deepLink
        theme = $plan.theme
        nonce = $plan.nonce
        fixtureProfile = $plan.fixtureProfile
        fixtureHash = $fixtureHash
        fixtureEpochMs = $plan.fixtureEpochMs
        sourceFingerprint = $sourceFingerprint
        apkHash = $apkHash
        buildHash = $buildHash
        deviceId = $DeviceId
        deviceModel = $deviceModel
        viewportWidth = $viewport.width
        viewportHeight = $viewport.height
        captureTimestamp = [DateTime]::UtcNow.ToString('o')
        staleBuildFingerprint = $false
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $plan.outputMetadata -Encoding utf8
}

[pscustomobject]@{
    mode = 'executed'
    deviceId = $DeviceId
    buildManifestPath = $buildMetadataAbsolute
    captures = @($plans | ForEach-Object { $_.outputPng })
} | ConvertTo-Json -Depth 5
