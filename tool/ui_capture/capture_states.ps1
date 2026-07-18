[CmdletBinding()]
param(
    [string[]]$Screens = @('all'),
    [ValidateSet('dark', 'light')]
    [string[]]$Themes = @('dark', 'light'),
    [switch]$Execute,
    [string]$DeviceId,
    [string]$OutputRoot = '.ui-diff/captures',
    [string]$BuildMetadataPath = '.ui-diff/captures/build-state.json',
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
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
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
        return [Convert]::ToHexString($sha.Hash).ToLowerInvariant()
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

$sourceFingerprint = Get-SourceFingerprint
$apkPath = Join-Path $repoRoot 'build/app/outputs/flutter-apk/app-debug.apk'
$apkHash = Get-Sha256Hex $apkPath
$buildMetadataAbsolute = if ([IO.Path]::IsPathRooted($BuildMetadataPath)) {
    $BuildMetadataPath
} else { Join-Path $repoRoot $BuildMetadataPath }
$previousBuild = Read-JsonFile $buildMetadataAbsolute
$buildIsFresh = $null -ne $previousBuild -and
    $previousBuild.sourceFingerprint -eq $sourceFingerprint -and
    $null -ne $apkHash -and
    $previousBuild.apkHash -eq $apkHash -and
    $previousBuild.deviceId -eq $DeviceId

$dateFolder = Join-Path $repoRoot (Join-Path $OutputRoot ([DateTime]::UtcNow.ToString('yyyy-MM-dd')))
$plans = foreach ($screen in $requestedScreens) {
    foreach ($theme in $Themes) {
        $nonce = [Guid]::NewGuid().ToString('N')
        $deepLink = "calorix://debug/reseed?screen=$screen&theme=$theme&nonce=$nonce&fixtureEpochMs=$FixtureEpochMs"
        [pscustomobject]@{
            screen = $screen
            theme = $theme
            nonce = $nonce
            fixtureEpochMs = $FixtureEpochMs
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
        actions = @($plans)
    } | ConvertTo-Json -Depth 8
    exit 0
}

Assert-ExplicitPhysicalDevice
if (-not $buildIsFresh) {
    & fvm flutter build apk --debug
    if ($LASTEXITCODE -ne 0) { throw 'Flutter debug APK build failed.' }
    $apkHash = Get-Sha256Hex $apkPath
    if ($null -eq $apkHash) { throw "Built APK not found at $apkPath" }
    & adb -s $DeviceId install -r $apkPath
    if ($LASTEXITCODE -ne 0) { throw 'APK install failed.' }
}

$buildHash = (& git rev-parse HEAD).Trim()
$metadataParent = Split-Path -Parent $buildMetadataAbsolute
New-Item -ItemType Directory -Force -Path $metadataParent | Out-Null
[pscustomobject]@{
    sourceFingerprint = $sourceFingerprint
    apkHash = $apkHash
    buildHash = $buildHash
    deviceId = $DeviceId
    installedAtUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $buildMetadataAbsolute -Encoding utf8

New-Item -ItemType Directory -Force -Path $dateFolder | Out-Null
$deviceModel = Invoke-AdbText @('shell', 'getprop', 'ro.product.model')
$pixelSize = Invoke-AdbText @('shell', 'wm', 'size')

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
        route = $plan.deepLink
        theme = $plan.theme
        nonce = $plan.nonce
        fixtureHash = $fixtureHash
        fixtureEpochMs = $plan.fixtureEpochMs
        sourceFingerprint = $sourceFingerprint
        apkHash = $apkHash
        buildHash = $buildHash
        deviceId = $DeviceId
        deviceModel = $deviceModel
        pixelSize = $pixelSize
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $plan.outputMetadata -Encoding utf8
}

[pscustomobject]@{
    mode = 'executed'
    deviceId = $DeviceId
    captures = @($plans | ForEach-Object { $_.outputPng })
} | ConvertTo-Json -Depth 5
