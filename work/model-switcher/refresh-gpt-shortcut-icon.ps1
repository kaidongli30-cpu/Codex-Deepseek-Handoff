$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$officialIcon = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0\app\resources\icon-chatgpt.ico'
$installDir = 'C:\Users\Lenovo\.codex\model-switcher'
$newIcon = Join-Path $installDir 'chatgpt-official-v2.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$taskPickerSuffix = ([char]0x9009) + ([char]0x62E9) + ([char]0x5DF2) + ([char]0x6709) + ([char]0x4EFB) + ([char]0x52A1)
$shortcutPath = Join-Path $desktop ('Codex - GPT - ' + $taskPickerSuffix + '.lnk')

foreach ($required in @($officialIcon, $installDir, $shortcutPath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required path not found: $required"
    }
}

Copy-Item -LiteralPath $officialIcon -Destination $newIcon -Force

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.IconLocation = "$newIcon,0"
$shortcut.Save()

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CodexShortcutShellNotify {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);
}
'@

[CodexShortcutShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

$iconRefresh = Join-Path $env:SystemRoot 'System32\ie4uinit.exe'
if (Test-Path -LiteralPath $iconRefresh) {
    & $iconRefresh -show
}

$verified = $shell.CreateShortcut($shortcutPath)
[ordered]@{
    shortcut = $shortcutPath
    target = $verified.TargetPath
    arguments = $verified.Arguments
    icon = $verified.IconLocation
    icon_bytes = (Get-Item -LiteralPath $newIcon).Length
} | ConvertTo-Json
