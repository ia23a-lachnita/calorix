# pull_flutter_anchors.ps1 — copy flutter-anchors.json from device to repo
#
# Usage:
#   .\scripts\pull_flutter_anchors.ps1
#   .\scripts\pull_flutter_anchors.ps1 -PackageId com.your.app -Screen history
#
# Prerequisites: adb is on PATH and exactly one device/emulator is connected.

param(
    [string]$PackageId = 'com.calorix.calorix',
    [string]$Screen    = 'today',
    [string]$OutDir    = ".ui-diff\$Screen\current"
)

$deviceSrcDir = "/data/user/0/$PackageId/app_flutter/ui-diff/$Screen/current"
$doneFlag     = "$deviceSrcDir/flutter-anchors.done"
$srcJson      = "$deviceSrcDir/flutter-anchors.json"

Write-Host "[anchor-pull] Package : $PackageId"
Write-Host "[anchor-pull] Screen  : $Screen"
Write-Host "[anchor-pull] Device  : $deviceSrcDir"
Write-Host "[anchor-pull] Out dir : $OutDir"
Write-Host ""

# Wait for the done flag (max 30 s).
$waited = 0
while ($waited -lt 30) {
    $exists = adb shell "[ -f '$doneFlag' ] && echo yes || echo no" 2>$null
    if ($exists -match 'yes') { break }
    Write-Host "[anchor-pull] waiting for done flag… ($waited s)"
    Start-Sleep -Seconds 2
    $waited += 2
}

if ($waited -ge 30) {
    Write-Error "[anchor-pull] Timed out waiting for flutter-anchors.done"
    exit 1
}

# Ensure destination directory exists.
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# Pull JSON using run-as for app-private storage.
$tmpLocal = "$OutDir\flutter-anchors.tmp.json"
adb shell "run-as $PackageId cat files/ui-diff/$Screen/current/flutter-anchors.json" > $tmpLocal

if (-not (Test-Path $tmpLocal) -or (Get-Item $tmpLocal).Length -eq 0) {
    # Fallback: direct adb pull (works on rooted devices or emulators).
    adb pull $srcJson $tmpLocal
}

if (-not (Test-Path $tmpLocal) -or (Get-Item $tmpLocal).Length -eq 0) {
    Write-Error "[anchor-pull] Failed to pull flutter-anchors.json"
    exit 1
}

$finalJson = "$OutDir\flutter-anchors.json"
Move-Item -Force $tmpLocal $finalJson

# Write local done flag.
Get-Date -Format 'o' | Set-Content "$OutDir\flutter-anchors.done"

Write-Host ""
Write-Host "[anchor-pull] Done: $finalJson"
Write-Host "[anchor-pull] Inspect with: Get-Content '$finalJson' | ConvertFrom-Json | Select-Object anchors"
