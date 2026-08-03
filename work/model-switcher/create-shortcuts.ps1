param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDir,

    [Parameter(Mandatory = $true)]
    [string]$CodexExe
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$desktop = [Environment]::GetFolderPath('Desktop')
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launcher = Join-Path $InstallDir 'codex-model-picker.ps1'
$deepSeekIcon = Join-Path $InstallDir 'deepseek.ico'
$gptIcon = Join-Path $InstallDir 'gpt.ico'
$workingDirectory = Join-Path $env:USERPROFILE 'Documents\Codex'

if (-not (Test-Path -LiteralPath $workingDirectory)) {
    $workingDirectory = $env:USERPROFILE
}

if (-not (Test-Path -LiteralPath $gptIcon)) {
    throw "GPT icon not found: $gptIcon"
}

$shell = New-Object -ComObject WScript.Shell

function New-ModelShortcut {
    param(
        [string]$Name,
        [string]$Provider,
        [string]$IconPath,
        [string]$Description
    )

    $shortcutPath = Join-Path $desktop ($Name + '.lnk')
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powershellExe
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`" -Provider $Provider"
    $shortcut.WorkingDirectory = $workingDirectory
    $shortcut.IconLocation = "$IconPath,0"
    $shortcut.Description = $Description
    $shortcut.WindowStyle = 1
    $shortcut.Save()
    return $shortcutPath
}

$gptName = ([char]0x0043) + 'odex - GPT - ' + ([char]0x9009) + ([char]0x62E9) + ([char]0x5DF2) + ([char]0x6709) + ([char]0x4EFB) + ([char]0x52A1)
$deepSeekName = 'Codex - DeepSeek - ' + ([char]0x9009) + ([char]0x62E9) + ([char]0x5DF2) + ([char]0x6709) + ([char]0x4EFB) + ([char]0x52A1)

$gptShortcut = New-ModelShortcut -Name $gptName -Provider 'gpt' -IconPath $gptIcon -Description 'Open all local Codex tasks and continue with GPT.'
$deepSeekShortcut = New-ModelShortcut -Name $deepSeekName -Provider 'deepseek' -IconPath $deepSeekIcon -Description 'Open all local Codex tasks and continue with DeepSeek.'

Write-Output $gptShortcut
Write-Output $deepSeekShortcut
