[CmdletBinding()]
param(
    [string]$InventoryPath = 'docs/design-handoff/placeholder-app/visual-state-inventory.json',
    [string]$ManifestPath = 'docs/design-handoff/placeholder-app/reference-images-manifest.json',
    [string]$ReferenceImagesPath = 'docs/design-handoff/placeholder-app/reference-images',
    [string]$OutputPath = '.ui-diff/expected/index.json',
    [switch]$Write
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

function Resolve-RepoPath {
    param([Parameter(Mandatory)][string]$Path)
    if ([IO.Path]::IsPathRooted($Path)) { return $Path }
    return Join-Path $repoRoot $Path
}

function Get-Sha256Hex {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-RequiredJson {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Description)
    $resolved = Resolve-RepoPath $Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "$Description not found at $resolved"
    }
    return (Get-Content -Raw -LiteralPath $resolved | ConvertFrom-Json)
}

$inventory = Read-RequiredJson -Path $InventoryPath -Description 'Visual-state inventory'
$manifest = Read-RequiredJson -Path $ManifestPath -Description 'Reference-images manifest'

# jsx_source_tree is the git tree of docs/design-handoff/placeholder-app/src
# (the JSX sources). It is distinct from source_tree, which is the
# docs/design-handoff/placeholder-app/reference-images tree recorded in the
# manifest. Fail closed: any git failure or mismatch aborts the script.
$jsxSourceTree = $inventory.jsx_source_tree
if ([string]::IsNullOrWhiteSpace($jsxSourceTree)) {
    throw 'Visual-state inventory is missing required jsx_source_tree.'
}

$jsxRelativePath = 'docs/design-handoff/placeholder-app/src'
$gitOutput = & git rev-parse "HEAD:$jsxRelativePath" 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse HEAD:$jsxRelativePath failed (exit $LASTEXITCODE): $gitOutput"
}
$actualJsxSourceTree = ($gitOutput | Select-Object -Last 1).ToString().Trim()
if ($actualJsxSourceTree -ne $jsxSourceTree) {
    throw "JSX source tree mismatch: inventory jsx_source_tree=$jsxSourceTree actual HEAD:$jsxRelativePath=$actualJsxSourceTree"
}

$manifestByFilename = @{}
foreach ($image in $manifest.reference_images) {
    $manifestByFilename[$image.filename] = $image
}

$referenceImagesAbsolute = Resolve-RepoPath $ReferenceImagesPath

# Never copy PNG bytes: every entry is a repo-relative pointer plus the
# manifest-recorded hash/dimensions, validated against the file on disk.
$pointers = New-Object System.Collections.Generic.List[object]
foreach ($state in $inventory.states) {
    foreach ($theme in @('dark', 'light')) {
        $filename = if ($theme -eq 'dark') { $state.referenceDark } else { $state.referenceLight }
        $manifestEntry = $manifestByFilename[$filename]
        if ($null -eq $manifestEntry) {
            throw "No manifest entry for $filename (state '$($state.id)', theme '$theme')."
        }

        $imagePath = Join-Path $referenceImagesAbsolute $filename
        if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
            throw "Reference image missing on disk: $imagePath"
        }

        $actualHash = Get-Sha256Hex $imagePath
        if ($actualHash -ne $manifestEntry.sha256) {
            throw "Hash mismatch for $filename`: manifest=$($manifestEntry.sha256) actual=$actualHash"
        }
        $actualBytes = (Get-Item -LiteralPath $imagePath).Length
        if ($actualBytes -ne $manifestEntry.size_bytes) {
            throw "Byte-count mismatch for $filename`: manifest=$($manifestEntry.size_bytes) actual=$actualBytes"
        }
        if ($manifestEntry.width -ne 402 -or $manifestEntry.height -ne 874) {
            throw "Non-canonical dimensions for $filename`: $($manifestEntry.width)x$($manifestEntry.height) (expected 402x874)"
        }

        $pointers.Add([pscustomobject]@{
            id                 = $state.id
            theme              = $theme
            jsxSource          = $state.jsxSource
            component          = $state.component
            props              = $state.props
            fixtureProfile     = $state.fixtureProfile
            referenceImagePath = "$ReferenceImagesPath/$filename".Replace('\', '/')
            sha256             = $manifestEntry.sha256
            width              = $manifestEntry.width
            height             = $manifestEntry.height
            sizeBytes          = $manifestEntry.size_bytes
            sourceCommit       = $inventory.source_commit
            referenceImagesTree = $inventory.source_tree
            jsxSourceTree      = $actualJsxSourceTree
        })
    }
}

# Deterministic order regardless of inventory JSON ordering: id then theme.
$orderedPointers = @($pointers | Sort-Object -Property @{ Expression = 'id' }, @{ Expression = 'theme' })

$index = [pscustomobject]@{
    sourceCommit        = $inventory.source_commit
    referenceImagesTree = $inventory.source_tree
    jsxSourceTree       = $actualJsxSourceTree
    count               = $orderedPointers.Count
    expected            = $orderedPointers
}

if (-not $Write) {
    [pscustomobject]@{
        mode    = 'validate-only'
        valid   = $true
        count   = $orderedPointers.Count
        outputPath = $OutputPath
    } | ConvertTo-Json -Depth 6
    exit 0
}

$outputAbsolute = Resolve-RepoPath $OutputPath
$outputParent = Split-Path -Parent $outputAbsolute
New-Item -ItemType Directory -Force -Path $outputParent | Out-Null
$index | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outputAbsolute -Encoding utf8

[pscustomobject]@{
    mode    = 'written'
    valid   = $true
    count   = $orderedPointers.Count
    outputPath = $OutputPath
} | ConvertTo-Json -Depth 6
