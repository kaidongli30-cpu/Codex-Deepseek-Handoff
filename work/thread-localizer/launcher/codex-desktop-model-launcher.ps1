param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('gpt', 'deepseek')]
    [string]$Provider,

    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$codexHome = Join-Path $env:USERPROFILE '.codex'
$configPath = Join-Path $codexHome 'config.toml'
$installDir = Join-Path $codexHome 'model-switcher'
$secretPath = Join-Path $installDir 'deepseek-api-key.dpapi'
$modelsPath = Join-Path $installDir 'models-deepseek.json'
$keyHelperPath = Join-Path $installDir 'get-deepseek-key.ps1'
$backupRoot = Join-Path $codexHome 'backups\desktop-model-switcher-switches'
$handoffToolRoot = 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\thread-localizer'
$handoffCliPath = Join-Path $handoffToolRoot 'src\cli.mjs'
$handoffSettingsPath = Join-Path $handoffToolRoot 'data\handoff-settings.json'
$handoffLogRoot = Join-Path $installDir 'handoff-logs'
$managedStart = '# >>> Codex desktop model switcher: mode (managed; do not edit)'
$managedEnd = '# <<< Codex desktop model switcher: mode'

function Show-LauncherMessage {
    param(
        [string]$Text,
        [string]$Title,
        [Windows.Forms.MessageBoxIcon]$Icon = [Windows.Forms.MessageBoxIcon]::Information
    )

    [void][Windows.Forms.MessageBox]::Show(
        $Text,
        $Title,
        [Windows.Forms.MessageBoxButtons]::OK,
        $Icon
    )
}

function Find-CodexExecutable {
    $binRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
    if (Test-Path -LiteralPath $binRoot) {
        $candidate = Get-ChildItem -LiteralPath $binRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                $exe = Join-Path $_.FullName 'codex.exe'
                if (Test-Path -LiteralPath $exe) { Get-Item -LiteralPath $exe }
            } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

        if ($candidate) { return $candidate.FullName }
    }

    $command = Get-Command 'codex.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    throw '找不到 Codex CLI。请先正常启动一次 Codex 桌面应用，再重试。'
}

function Find-NodeExecutable {
    $command = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw '找不到 Node.js，无法执行任务交接。'
}

function Get-HandoffSettings {
    if (-not (Test-Path -LiteralPath $handoffSettingsPath)) {
        throw "找不到交接模型配置：$handoffSettingsPath"
    }
    return Get-Content -LiteralPath $handoffSettingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-ActiveModel {
    param([string]$TargetProvider)
    $settings = Get-HandoffSettings
    $property = $settings.managedProviders.PSObject.Properties[$TargetProvider]
    if (-not $property -or -not $property.Value.activeModel) {
        throw "交接模型配置中没有提供商：$TargetProvider"
    }
    $activeModel = [string]$property.Value.activeModel
    if ($TargetProvider -eq 'deepseek') {
        $catalog = Get-Content -LiteralPath $modelsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $catalogModels = @($catalog.models | ForEach-Object { [string]$_.slug })
        if ($activeModel -notin $catalogModels) {
            throw "DeepSeek 活动模型 $activeModel 不在模型目录 $modelsPath 中。"
        }
    }
    return $activeModel
}

function Invoke-BatchHandoff {
    param([string]$TargetProvider)

    if (-not (Test-Path -LiteralPath $handoffCliPath)) {
        throw "找不到滚动交接工具：$handoffCliPath"
    }
    New-Item -ItemType Directory -Path $handoffLogRoot -Force | Out-Null
    $handoffTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $stdoutPath = Join-Path $handoffLogRoot "handoff.$handoffTimestamp.$TargetProvider.stdout.json"
    $stderrPath = Join-Path $handoffLogRoot "handoff.$handoffTimestamp.$TargetProvider.stderr.txt"
    $engineProvider = if ($TargetProvider -eq 'gpt') { 'openai' } else { $TargetProvider }

    $arguments = @(
        $handoffCliPath,
        'batch-handoff',
        '--execute',
        '--target-provider', $engineProvider
    )
    $process = Start-Process -FilePath (Find-NodeExecutable) `
        -ArgumentList $arguments `
        -WorkingDirectory $handoffToolRoot `
        -WindowStyle Hidden `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath
    if ($process.ExitCode -ne 0) {
        $details = @()
        if (Test-Path -LiteralPath $stderrPath) {
            $details += Get-Content -LiteralPath $stderrPath -Tail 8 -ErrorAction SilentlyContinue
        }
        if (-not $details -and (Test-Path -LiteralPath $stdoutPath)) {
            $details += Get-Content -LiteralPath $stdoutPath -Tail 8 -ErrorAction SilentlyContinue
        }
        throw "任务交接到 $TargetProvider 失败。`n$($details -join [Environment]::NewLine)"
    }
    $result = Get-Content -LiteralPath $stdoutPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($result.summary.failed -gt 0 -or $result.summary.blocked -gt 0) {
        throw @"
任务尚未全部交接到 $TargetProvider，因此 Codex 不会启动。

成功：$($result.summary.handedOff)
无需交接：$($result.summary.noop)
阻塞：$($result.summary.blocked)
失败：$($result.summary.failed)

请根据详细报告处理后，再点击相应的交接快捷方式：
$($result.resultPath)
"@
    }
    return $result
}

function New-ModeBlock {
    param([string]$Mode)

    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add($managedStart)
    $lines.Add("# active_mode = $Mode")

    if ($Mode -eq 'gpt') {
        $lines.Add("model = `"$(Get-ActiveModel 'openai')`"")
        $lines.Add('model_reasoning_effort = "high"')
        $lines.Add('forced_login_method = "chatgpt"')
    } else {
        $catalog = $modelsPath -replace '\\', '/'
        $lines.Add("model = `"$(Get-ActiveModel 'deepseek')`"")
        $lines.Add('model_provider = "deepseek"')
        $lines.Add('model_reasoning_effort = "high"')
        $lines.Add("model_catalog_json = `"$catalog`"")
        $lines.Add('forced_login_method = "api"')
    }

    $lines.Add($managedEnd)
    return ($lines -join "`n")
}

function Set-CandidateMode {
    param(
        [string]$RawConfig,
        [string]$Mode
    )

    $startPattern = [regex]::Escape($managedStart)
    $endPattern = [regex]::Escape($managedEnd)
    $pattern = "(?ms)^$startPattern\r?\n.*?^$endPattern"
    $matches = [regex]::Matches($RawConfig, $pattern)
    if ($matches.Count -ne 1) {
        throw "配置中应当恰好存在一个受管模式区块，实际找到 $($matches.Count) 个。为避免误改，已停止。"
    }

    $replacement = New-ModeBlock $Mode
    return [regex]::Replace($RawConfig, $pattern, $replacement, 1)
}

function Test-CandidateConfig {
    param([string]$Candidate)

    $codexExe = Find-CodexExecutable
    $validationHome = Join-Path $installDir ('.preflight-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $validationHome -Force | Out-Null
    $validationConfig = Join-Path $validationHome 'config.toml'
    $validationError = Join-Path $validationHome 'doctor.stderr.txt'
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($validationConfig, $Candidate, $utf8NoBom)

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
        if ($null -eq $savedCodexHome) {
            Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue
        } else {
            $env:CODEX_HOME = $savedCodexHome
        }
        Remove-Item -LiteralPath $validationHome -Recurse -Force -ErrorAction SilentlyContinue
    }

    if (-not $configCheck -or $configCheck.status -ne 'ok') {
        throw '新配置未通过 Codex 严格检查，因此没有写入。'
    }
}

function Request-DeepSeekKey {
    $form = New-Object Windows.Forms.Form
    $form.Text = 'DeepSeek API Key'
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ClientSize = New-Object Drawing.Size(470, 165)

    $label = New-Object Windows.Forms.Label
    $label.Text = '请输入 DeepSeek API Key（以 sk- 开头）。密钥将由 Windows 加密保存。'
    $label.AutoSize = $false
    $label.Location = New-Object Drawing.Point(18, 18)
    $label.Size = New-Object Drawing.Size(430, 42)
    $form.Controls.Add($label)

    $textBox = New-Object Windows.Forms.TextBox
    $textBox.Location = New-Object Drawing.Point(20, 67)
    $textBox.Size = New-Object Drawing.Size(425, 25)
    $textBox.UseSystemPasswordChar = $true
    $form.Controls.Add($textBox)

    $okButton = New-Object Windows.Forms.Button
    $okButton.Text = '保存并启动'
    $okButton.Location = New-Object Drawing.Point(274, 112)
    $okButton.Size = New-Object Drawing.Size(92, 30)
    $okButton.DialogResult = [Windows.Forms.DialogResult]::OK
    $form.Controls.Add($okButton)

    $cancelButton = New-Object Windows.Forms.Button
    $cancelButton.Text = '取消'
    $cancelButton.Location = New-Object Drawing.Point(374, 112)
    $cancelButton.Size = New-Object Drawing.Size(72, 30)
    $cancelButton.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancelButton)

    $form.AcceptButton = $okButton
    $form.CancelButton = $cancelButton
    $form.Add_Shown({ $textBox.Focus() })

    $result = $form.ShowDialog()
    if ($result -ne [Windows.Forms.DialogResult]::OK) { return $null }
    return $textBox.Text.Trim()
}

function Save-DeepSeekKey {
    param([string]$PlainValue)

    if ($PlainValue -cnotlike 'sk-*') { throw 'DeepSeek API Key 必须以 sk- 开头。' }
    $secureValue = ConvertTo-SecureString $PlainValue -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secureValue
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($secretPath, $encrypted + [Environment]::NewLine, $utf8NoBom)
}

function Restore-GptMode {
    $currentConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
    $gptConfig = Set-CandidateMode -RawConfig $currentConfig -Mode 'gpt'
    $restoreTimestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $restoreTemporary = Join-Path $codexHome "config.toml.restore-gpt-$restoreTimestamp.tmp"
    $restoreBackup = Join-Path $backupRoot "config.$restoreTimestamp.before-auto-restore-gpt.toml"
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($restoreTemporary, $gptConfig, $utf8NoBom)
    [IO.File]::Replace($restoreTemporary, $configPath, $restoreBackup, $true)
}

function Wait-For-CodexToExit {
    $deadline = (Get-Date).AddSeconds(30)
    $appStarted = $false
    while ((Get-Date) -lt $deadline) {
        if (Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue) {
            $appStarted = $true
            break
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $appStarted) {
        return
    }

    $noProcessChecks = 0
    while ($noProcessChecks -lt 3) {
        if (Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue) {
            $noProcessChecks = 0
        } else {
            $noProcessChecks++
        }
        Start-Sleep -Seconds 1
    }
}

$launcherMutex = $null
$launcherMutexAcquired = $false

try {
    if (-not $ValidateOnly) {
        $launcherMutex = [System.Threading.Mutex]::new($false, 'Local\CodexDesktopProviderHandoff')
        try {
            $launcherMutexAcquired = $launcherMutex.WaitOne([TimeSpan]::FromMinutes(30))
        } catch [System.Threading.AbandonedMutexException] {
            $launcherMutexAcquired = $true
        }
        if (-not $launcherMutexAcquired) {
            throw '等待上一轮模型交接超过 30 分钟。Codex 未启动，请确认没有遗留的交接进程后重试。'
        }
    }

    foreach ($required in @($configPath, $modelsPath, $keyHelperPath, $handoffSettingsPath)) {
        if (-not (Test-Path -LiteralPath $required)) { throw "缺少必需文件：$required" }
    }

    $rawConfig = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8
    $candidate = Set-CandidateMode -RawConfig $rawConfig -Mode $Provider
    Test-CandidateConfig $candidate

    if ($ValidateOnly) {
        [ordered]@{
            provider = $Provider
            config_valid = $true
            config_would_change = ($candidate -cne $rawConfig)
        } | ConvertTo-Json
        exit 0
    }

    $runningApp = Get-Process -Name 'ChatGPT' -ErrorAction SilentlyContinue
    if ($runningApp) {
        Show-LauncherMessage -Title '请先关闭 Codex' -Icon Warning -Text @'
Codex 桌面应用仍在运行。

请先完全关闭当前 Codex 窗口，再重新点击此快捷方式。这样新配置才能在启动时生效，也能避免同一个任务被两个进程同时写入。
'@
        exit 2
    }

    if ($Provider -eq 'deepseek' -and -not (Test-Path -LiteralPath $secretPath)) {
        $deepSeekKey = Request-DeepSeekKey
        if (-not $deepSeekKey) { exit 0 }
        Save-DeepSeekKey $deepSeekKey
        $deepSeekKey = $null
    }

    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $backupPath = Join-Path $backupRoot "config.$timestamp.before-$Provider.toml"
    $temporaryConfig = Join-Path $codexHome "config.toml.model-switcher-$timestamp.tmp"
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($temporaryConfig, $candidate, $utf8NoBom)

    [IO.File]::Replace($temporaryConfig, $configPath, $backupPath, $true)

    try {
        $null = Invoke-BatchHandoff -TargetProvider $Provider
        $savedErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        $launchOutput = & (Find-CodexExecutable) app 2>&1
        # Native applications may write ordinary status text to stderr. In
        # Windows PowerShell that can make `$?` false even when the native
        # process exited successfully, so only trust the native exit code.
        $launchExit = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
        $ErrorActionPreference = $savedErrorActionPreference
        $reportedOpening = (@($launchOutput | ForEach-Object { "$_" }) -join "`n") -match 'Opening workspace .+ in the Desktop app'
        if ($launchExit -ne 0 -and -not $reportedOpening) {
            $launchDetails = @($launchOutput | Select-Object -Last 5 | ForEach-Object { "$_" }) -join [Environment]::NewLine
            throw "Codex 官方 app 启动命令返回错误 $launchExit。`n$launchDetails"
        }

        if ($Provider -eq 'deepseek') {
            Wait-For-CodexToExit
            Restore-GptMode
            $null = Invoke-BatchHandoff -TargetProvider 'openai'
        }
    } catch {
        Copy-Item -LiteralPath $backupPath -Destination $configPath -Force
        throw "任务交接或桌面 Codex 启动失败，配置已自动恢复。$($_.Exception.Message)"
    }
} catch {
    if ($ValidateOnly) {
        [Console]::Error.WriteLine($_.Exception.Message)
    } else {
        Show-LauncherMessage -Title 'Codex 模型切换失败' -Icon Error -Text $_.Exception.Message
    }
    exit 1
} finally {
    if ($launcherMutexAcquired -and $null -ne $launcherMutex) {
        $launcherMutex.ReleaseMutex()
    }
    if ($null -ne $launcherMutex) {
        $launcherMutex.Dispose()
    }
}
