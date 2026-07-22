# Copies the plugin files from this repo into the myJourney vault for live testing.
# Run from anywhere:  powershell -File scripts\syncToVault.ps1
# Then in Obsidian: Ctrl+P -> "Reload app without saving"

$repoRoot = Split-Path $PSScriptRoot -Parent
$vaultPlugin = 'C:\Users\Francois\Proton Drive\charette.francois\My files\Obsidian\myJourney\.obsidian\plugins\html-font-toolbar'

if (-not (Test-Path $vaultPlugin)) {
    New-Item -ItemType Directory -Force $vaultPlugin | Out-Null
}

Copy-Item (Join-Path $repoRoot 'main.js'), (Join-Path $repoRoot 'manifest.json'), (Join-Path $repoRoot 'styles.css') $vaultPlugin -Force
Write-Host "Synced main.js, manifest.json, styles.css -> $vaultPlugin"
