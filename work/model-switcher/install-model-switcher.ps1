$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sourceDir = 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher'
$codexHome = 'C:\Users\Lenovo\.codex'
$installDir = Join-Path $codexHome 'model-switcher'
$gptProfile = Join-Path $codexHome 'gpt.config.toml'
$deepSeekProfile = Join-Path $codexHome 'deepseek.config.toml'
$codexExe = 'C:\Users\Lenovo\AppData\Local\OpenAI\Codex\bin\d7e8094cfb76a267\codex.exe'

foreach ($required in @(
    (Join-Path $sourceDir 'codex-model-picker.ps1'),
    (Join-Path $sourceDir 'create-shortcuts.ps1'),
    (Join-Path $sourceDir 'gpt.config.toml'),
    (Join-Path $sourceDir 'deepseek.config.toml'),
    (Join-Path $sourceDir 'models-deepseek.json'),
    (Join-Path $sourceDir 'deepseek.ico'),
    (Join-Path $sourceDir 'gpt.ico'),
    (Join-Path $codexHome 'config.toml'),
    $codexExe
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required file not found: $required"
    }
}

foreach ($target in @($installDir, $gptProfile, $deepSeekProfile)) {
    if (Test-Path -LiteralPath $target) {
        throw "Target already exists; installation stopped without overwriting it: $target"
    }
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $codexHome "backups\model-switcher-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $codexHome 'config.toml') -Destination (Join-Path $backupDir 'config.toml.before-model-switcher')

New-Item -ItemType Directory -Path $installDir | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir 'models-deepseek.json') -Destination $installDir
Copy-Item -LiteralPath (Join-Path $sourceDir 'deepseek.ico') -Destination $installDir
Copy-Item -LiteralPath (Join-Path $sourceDir 'gpt.ico') -Destination $installDir
Copy-Item -LiteralPath (Join-Path $sourceDir 'README.txt') -Destination $installDir

$utf8Bom = New-Object Text.UTF8Encoding($true)
foreach ($scriptName in @('codex-model-picker.ps1', 'create-shortcuts.ps1')) {
    $scriptText = Get-Content -LiteralPath (Join-Path $sourceDir $scriptName) -Raw -Encoding UTF8
    [IO.File]::WriteAllText((Join-Path $installDir $scriptName), $scriptText, $utf8Bom)
}

Copy-Item -LiteralPath (Join-Path $sourceDir 'gpt.config.toml') -Destination $gptProfile
Copy-Item -LiteralPath (Join-Path $sourceDir 'deepseek.config.toml') -Destination $deepSeekProfile

& (Join-Path $installDir 'create-shortcuts.ps1') -InstallDir $installDir -CodexExe $codexExe

Write-Output "INSTALL_DIR=$installDir"
Write-Output "BACKUP_DIR=$backupDir"
