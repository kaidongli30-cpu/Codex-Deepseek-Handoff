[CmdletBinding()]
param(
    [string]$InstallRoot = '',
    [string]$IconPath = '',
    [string]$ShortcutPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $InstallRoot) {
    $InstallRoot = if ($env:CODEX_MODEL_SWITCHER_ROOT) {
        [IO.Path]::GetFullPath($env:CODEX_MODEL_SWITCHER_ROOT)
    } else {
        Join-Path (Join-Path $env:USERPROFILE '.codex') 'model-switcher'
    }
}
$installDir = [IO.Path]::GetFullPath($InstallRoot)
$launcherPath = Join-Path $installDir 'codex-desktop-model-launcher.ps1'
$fallbackIconPath = Join-Path $env:SystemRoot 'System32\shell32.dll'
if (-not $IconPath) {
    $candidateIcon = Join-Path $installDir 'chatgpt-official-v2.ico'
    $IconPath = if (Test-Path -LiteralPath $candidateIcon -PathType Leaf) { $candidateIcon } else { $fallbackIconPath }
}
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutName = ([char]0x4EFB) + ([char]0x52A1) + ([char]0x4EA4) + ([char]0x63A5) + 'GPT.lnk'
$shortcutPath = if ($ShortcutPath) { [IO.Path]::GetFullPath($ShortcutPath) } else { Join-Path $desktopPath $shortcutName }
$pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
$powershellPath = if ($null -ne $pwsh -and $pwsh.Path) {
    $pwsh.Path
} else {
    Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
}
$workingDirectory = Join-Path $env:USERPROFILE 'Documents\Codex'
if (-not (Test-Path -LiteralPath $workingDirectory -PathType Container)) {
    $workingDirectory = $env:USERPROFILE
}

foreach ($requiredPath in @($launcherPath, $IconPath, $powershellPath, $workingDirectory)) {
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
