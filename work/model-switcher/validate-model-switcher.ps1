$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$codexHome = 'C:\Users\Lenovo\.codex'
$installDir = Join-Path $codexHome 'model-switcher'
$codexExe = 'C:\Users\Lenovo\AppData\Local\OpenAI\Codex\bin\d7e8094cfb76a267\codex.exe'
$backupDir = Get-ChildItem -LiteralPath (Join-Path $codexHome 'backups') -Directory |
    Where-Object Name -like 'model-switcher-*' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $backupDir) { throw 'Model switcher backup was not found.' }

$syntaxResults = @()
foreach ($scriptName in @('codex-model-picker.ps1', 'create-shortcuts.ps1')) {
    $scriptPath = Join-Path $installDir $scriptName
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
    $syntaxResults += [ordered]@{
        file = $scriptPath
        syntax_error_count = @($errors).Count
    }
}

$mainHash = (Get-FileHash -LiteralPath (Join-Path $codexHome 'config.toml') -Algorithm SHA256).Hash
$backupHash = (Get-FileHash -LiteralPath (Join-Path $backupDir.FullName 'config.toml.before-model-switcher') -Algorithm SHA256).Hash

$models = Get-Content -LiteralPath (Join-Path $installDir 'models-deepseek.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$modelSlugs = @($models.models | ForEach-Object slug)

$desktop = [Environment]::GetFolderPath('Desktop')
$taskPickerSuffix = ([char]0x9009) + ([char]0x62E9) + ([char]0x5DF2) + ([char]0x6709) + ([char]0x4EFB) + ([char]0x52A1)
$shortcutFiles = @(
    (Join-Path $desktop ('Codex - GPT - ' + $taskPickerSuffix + '.lnk')),
    (Join-Path $desktop ('Codex - DeepSeek - ' + $taskPickerSuffix + '.lnk'))
)
$shell = New-Object -ComObject WScript.Shell
$shortcutResults = foreach ($shortcutFile in $shortcutFiles) {
    $shortcut = $shell.CreateShortcut($shortcutFile)
    [ordered]@{
        path = $shortcutFile
        target = $shortcut.TargetPath
        arguments = $shortcut.Arguments
        icon = $shortcut.IconLocation
    }
}

$launcher = Join-Path $installDir 'codex-model-picker.ps1'
$gptDryRun = & $launcher -Provider gpt -DryRun 2>&1
$gptDryRunExit = $LASTEXITCODE
$deepSeekDryRun = & $launcher -Provider deepseek -DryRun 2>&1
$deepSeekDryRunExit = $LASTEXITCODE

$savedErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$gptParseOutput = & $codexExe --profile gpt mcp list 2>&1
$gptParseExit = if ($?) { 0 } else { if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 } }
$deepSeekParseOutput = & $codexExe --profile deepseek mcp list 2>&1
$deepSeekParseExit = if ($?) { 0 } else { if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 } }
$ErrorActionPreference = $savedErrorActionPreference

$result = [ordered]@{
    main_config_unchanged = ($mainHash -eq $backupHash)
    syntax = $syntaxResults
    model_slugs = $modelSlugs
    shortcuts = $shortcutResults
    launcher_dry_run = [ordered]@{
        gpt_exit = $gptDryRunExit
        gpt = @($gptDryRun | ForEach-Object { "$_" })
        deepseek_exit = $deepSeekDryRunExit
        deepseek = @($deepSeekDryRun | ForEach-Object { "$_" })
    }
    profile_config_parse = [ordered]@{
        gpt_exit = $gptParseExit
        deepseek_exit = $deepSeekParseExit
        gpt_error_tail = if ($gptParseExit -ne 0) { @($gptParseOutput | Select-Object -Last 8 | ForEach-Object { "$_" }) } else { @() }
        deepseek_error_tail = if ($deepSeekParseExit -ne 0) { @($deepSeekParseOutput | Select-Object -Last 8 | ForEach-Object { "$_" }) } else { @() }
    }
    deepseek_key_saved = (Test-Path -LiteralPath (Join-Path $installDir 'deepseek-api-key.dpapi'))
}

$result | ConvertTo-Json -Depth 6
