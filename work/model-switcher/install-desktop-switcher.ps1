$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sourceDir = 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher'
$codexHome = Join-Path $env:USERPROFILE '.codex'
$installDir = Join-Path $codexHome 'model-switcher'
$configPath = Join-Path $codexHome 'config.toml'
$desktop = [Environment]::GetFolderPath('Desktop')
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launcherPath = Join-Path $installDir 'codex-desktop-model-launcher.ps1'
$gptIcon = Join-Path $installDir 'chatgpt-official-v2.ico'
$deepSeekIcon = Join-Path $installDir 'deepseek.ico'
$modelsPath = Join-Path $installDir 'models-deepseek.json'
$keyHelperPath = Join-Path $installDir 'get-deepseek-key.ps1'
$managedStart = '# >>> Codex desktop model switcher: mode (managed; do not edit)'
$managedEnd = '# <<< Codex desktop model switcher: mode'
$providerStart = '# >>> Codex desktop model switcher: DeepSeek provider (managed; do not edit)'
$providerEnd = '# <<< Codex desktop model switcher: DeepSeek provider'

function Find-CodexExecutable {
    $binRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    $candidate = Get-ChildItem -LiteralPath $binRoot -Directory -ErrorAction SilentlyContinue |
        ForEach-Object {
            $exe = Join-Path $_.FullName 'codex.exe'
            if (Test-Path -LiteralPath $exe) { Get-Item -LiteralPath $exe }
        } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
    throw 'Codex CLI was not found.'
}

function Test-PowerShellSyntax {
    param([string]$Path)

    $tokens = $null
    $syntaxErrors = $null
    $scriptSource = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    [void][System.Management.Automation.Language.Parser]::ParseInput(
        $scriptSource,
        [ref]$tokens,
        [ref]$syntaxErrors
    )
    if (@($syntaxErrors).Count -ne 0) {
        $details = @($syntaxErrors | ForEach-Object { "line $($_.Extent.StartLineNumber): $($_.Message)" }) -join '; '
        throw "PowerShell syntax validation failed for $Path`: $details"
    }
}

function New-ModeBlock {
    param([string]$Mode)

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add($managedStart)
    $lines.Add("# active_mode = $Mode")
    if ($Mode -eq 'gpt') {
        $lines.Add('model = "gpt-5.6-sol"')
        $lines.Add('model_reasoning_effort = "high"')
        $lines.Add('forced_login_method = "chatgpt"')
    } else {
        $catalog = $modelsPath -replace '\\', '/'
        $lines.Add('model = "deepseek-v4-flash"')
        $lines.Add('model_provider = "deepseek"')
        $lines.Add('model_reasoning_effort = "high"')
        $lines.Add("model_catalog_json = `"$catalog`"")
        $lines.Add('forced_login_method = "api"')
    }
    $lines.Add($managedEnd)
    return ($lines -join "`n")
}

function Remove-ManagedTopLevelKeys {
    param([string]$RawConfig)

    $managedKeys = @(
        'model',
        'model_provider',
        'model_reasoning_effort',
        'model_catalog_json',
        'forced_login_method',
        'preferred_auth_method'
    )
    $keyPattern = '^\s*(' + (($managedKeys | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')\s*='
    $lines = @(($RawConfig -replace "`r`n", "`n") -split "`n")
    $result = New-Object System.Collections.Generic.List[string]
    $atTopLevel = $true
    foreach ($line in $lines) {
        if ($line -match '^\s*\[') { $atTopLevel = $false }
        if ($atTopLevel -and $line -match $keyPattern) { continue }
        $result.Add($line)
    }
    return ($result -join "`n").TrimStart("`n")
}

function Add-ProviderBlock {
    param([string]$RawConfig)

    $helper = $keyHelperPath -replace '\\', '/'
    $lines = @(
        $providerStart,
        '[model_providers.deepseek]',
        'name = "DeepSeek"',
        'base_url = "https://api.deepseek.com/"',
        'wire_api = "responses"',
        'requires_openai_auth = false',
        '',
        '[model_providers.deepseek.auth]',
        'command = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"',
        "args = [`"-NoProfile`", `"-ExecutionPolicy`", `"Bypass`", `"-File`", `"$helper`"]",
        'timeout_ms = 5000',
        'refresh_interval_ms = 300000',
        $providerEnd
    )
    return $RawConfig.TrimEnd() + "`n`n" + ($lines -join "`n") + "`n"
}

function Set-CandidateMode {
    param([string]$RawConfig, [string]$Mode)
    $startPattern = [regex]::Escape($managedStart)
    $endPattern = [regex]::Escape($managedEnd)
    $pattern = "(?ms)^$startPattern\r?\n.*?^$endPattern"
    return [regex]::Replace($RawConfig, $pattern, (New-ModeBlock $Mode), 1)
}

function Test-CandidateConfig {
    param([string]$Candidate, [string]$Label)

    $codexExe = Find-CodexExecutable
    $validationHome = Join-Path $installDir ('.preflight-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $validationHome -Force | Out-Null
    $validationError = Join-Path $validationHome 'doctor.stderr.txt'
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText((Join-Path $validationHome 'config.toml'), $Candidate, $utf8NoBom)
    $savedCodexHome = $env:CODEX_HOME
    $savedErrorActionPreference = $ErrorActionPreference
    try {
        $env:CODEX_HOME = $validationHome
        $ErrorActionPreference = 'Continue'
        $doctorOutput = & $codexExe --strict-config doctor --json 2>$validationError
        $doctorJson = (($doctorOutput | ForEach-Object { "$_" }) -join [Environment]::NewLine) | ConvertFrom-Json
        $configCheck = $doctorJson.checks.'config.load'
    } finally {
        $ErrorActionPreference = $savedErrorActionPreference
        if ($null -eq $savedCodexHome) { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue } else { $env:CODEX_HOME = $savedCodexHome }
        Remove-Item -LiteralPath $validationHome -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (-not $configCheck -or $configCheck.status -ne 'ok') {
        throw "$Label configuration failed strict validation."
    }
}

foreach ($required in @(
    (Join-Path $sourceDir 'codex-desktop-model-launcher.ps1'),
    (Join-Path $sourceDir 'get-deepseek-key.ps1'),
    $modelsPath,
    $configPath,
    $gptIcon,
    $deepSeekIcon
)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file not found: $required" }
}

Test-PowerShellSyntax (Join-Path $sourceDir 'codex-desktop-model-launcher.ps1')
Test-PowerShellSyntax (Join-Path $sourceDir 'get-deepseek-key.ps1')

$models = Get-Content -LiteralPath $modelsPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ('deepseek-v4-flash' -notin @($models.models | ForEach-Object slug)) {
    throw 'models-deepseek.json does not contain deepseek-v4-flash.'
}

$rawConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
if ($rawConfig.Contains($managedStart) -or $rawConfig.Contains($providerStart)) {
    throw 'The desktop switcher is already installed. Stopped to avoid creating duplicate managed blocks.'
}
if ($rawConfig -match '(?m)^\s*profile\s*=') {
    throw 'config.toml contains the unsupported legacy top-level profile selector. Remove it before installing.'
}
if ($rawConfig -match '(?m)^\s*\[model_providers\.deepseek(?:\.|\])') {
    throw 'config.toml already contains a DeepSeek provider. Stopped to avoid overwriting a user-defined provider.'
}

$baseConfig = Remove-ManagedTopLevelKeys $rawConfig
$candidateGpt = (New-ModeBlock 'gpt') + "`n`n" + $baseConfig
$candidateGpt = Add-ProviderBlock $candidateGpt
$candidateDeepSeek = Set-CandidateMode -RawConfig $candidateGpt -Mode 'deepseek'

Test-CandidateConfig -Candidate $candidateGpt -Label 'GPT'
Test-CandidateConfig -Candidate $candidateDeepSeek -Label 'DeepSeek'

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $codexHome "backups\desktop-model-switcher-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupDir 'config.toml.before-desktop-switcher')

$taskPickerSuffix = ([char]0x9009) + ([char]0x62E9) + ([char]0x5DF2) + ([char]0x6709) + ([char]0x4EFB) + ([char]0x52A1)
$shortcutSpecs = @(
    [ordered]@{ name = 'Codex - DeepSeek - ' + $taskPickerSuffix; provider = 'deepseek'; icon = $deepSeekIcon; description = 'Switch to DeepSeek API and open the Codex desktop app.' }
)

foreach ($spec in $shortcutSpecs) {
    $existing = Join-Path $desktop ($spec.name + '.lnk')
    if (Test-Path -LiteralPath $existing) {
        Copy-Item -LiteralPath $existing -Destination (Join-Path $backupDir ($spec.name + '.lnk'))
    }
}

$utf8Bom = New-Object Text.UTF8Encoding($true)
foreach ($scriptName in @('codex-desktop-model-launcher.ps1', 'get-deepseek-key.ps1')) {
    $scriptText = Get-Content -LiteralPath (Join-Path $sourceDir $scriptName) -Raw -Encoding UTF8
    [IO.File]::WriteAllText((Join-Path $installDir $scriptName), $scriptText, $utf8Bom)
}

$temporaryConfig = Join-Path $codexHome "config.toml.desktop-switcher-$timestamp.tmp"
$utf8NoBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($temporaryConfig, $candidateGpt, $utf8NoBom)
$installBackup = Join-Path $backupDir 'config.toml.atomic-replace-backup'
[IO.File]::Replace($temporaryConfig, $configPath, $installBackup, $true)

$shell = New-Object -ComObject WScript.Shell
foreach ($spec in $shortcutSpecs) {
    $shortcutPath = Join-Path $desktop ($spec.name + '.lnk')
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershellExe
    $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`" -Provider $($spec.provider)"
    $shortcut.WorkingDirectory = Join-Path $env:USERPROFILE 'Documents\Codex'
    $shortcut.IconLocation = "$($spec.icon),0"
    $shortcut.Description = $spec.description
    $shortcut.WindowStyle = 7
    $shortcut.Save()
}

$legacyGptShortcut = Join-Path $desktop ('Codex - GPT - ' + $taskPickerSuffix + '.lnk')
if (Test-Path -LiteralPath $legacyGptShortcut) {
    Copy-Item -LiteralPath $legacyGptShortcut -Destination (Join-Path $backupDir ('Codex - GPT - ' + $taskPickerSuffix + '.lnk')) -Force
    Remove-Item -LiteralPath $legacyGptShortcut -Force
}

[ordered]@{
    installed = $true
    active_mode = 'gpt'
    backup = $backupDir
    normal_gpt_entry = 'Windows taskbar Codex icon'
    deepseek_shortcut = Join-Path $desktop ($shortcutSpecs[0].name + '.lnk')
} | ConvertTo-Json
