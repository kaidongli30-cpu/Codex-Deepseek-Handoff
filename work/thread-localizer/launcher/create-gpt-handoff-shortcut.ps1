$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$codexHome = Join-Path $env:USERPROFILE '.codex'
$installDir = Join-Path $codexHome 'model-switcher'
$launcherPath = Join-Path $installDir 'codex-desktop-model-launcher.ps1'
$iconPath = Join-Path $installDir 'chatgpt-official-v2.ico'
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutName = ([char]0x4EFB) + ([char]0x52A1) + ([char]0x4EA4) + ([char]0x63A5) + 'GPT.lnk'
$shortcutPath = Join-Path $desktopPath $shortcutName
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$workingDirectory = Join-Path $env:USERPROFILE 'Documents\Codex'

foreach ($requiredPath in @($launcherPath, $iconPath, $powershellPath, $workingDirectory)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path for the GPT handoff shortcut does not exist: $requiredPath"
    }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`" -Provider gpt"
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Finish the DeepSeek-to-GPT task handoff before opening Codex.'
$shortcut.WindowStyle = 7
$shortcut.Save()

$savedShortcut = $shell.CreateShortcut($shortcutPath)
[ordered]@{
    shortcut = $shortcutPath
    target = $savedShortcut.TargetPath
    arguments = $savedShortcut.Arguments
    workingDirectory = $savedShortcut.WorkingDirectory
    icon = $savedShortcut.IconLocation
} | ConvertTo-Json
