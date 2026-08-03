$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$officialIcon = 'C:\Program Files\WindowsApps\OpenAI.Codex_26.727.6591.0_x64__2p2nqsd0c76g0\app\resources\icon-chatgpt.ico'
$workspaceIcon = 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher\gpt.ico'
$installedIcon = 'C:\Users\Lenovo\.codex\model-switcher\gpt.ico'
$shortcutSource = 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher\create-shortcuts.ps1'
$shortcutInstalled = 'C:\Users\Lenovo\.codex\model-switcher\create-shortcuts.ps1'
$installDir = 'C:\Users\Lenovo\.codex\model-switcher'
$codexExe = 'C:\Users\Lenovo\AppData\Local\OpenAI\Codex\bin\d7e8094cfb76a267\codex.exe'

foreach ($required in @($officialIcon, $shortcutSource, $shortcutInstalled, $codexExe)) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Required file not found: $required" }
}

Copy-Item -LiteralPath $officialIcon -Destination $workspaceIcon -Force
Copy-Item -LiteralPath $officialIcon -Destination $installedIcon -Force

$shortcutText = Get-Content -LiteralPath $shortcutSource -Raw -Encoding UTF8
$utf8Bom = New-Object Text.UTF8Encoding($true)
[IO.File]::WriteAllText($shortcutInstalled, $shortcutText, $utf8Bom)

& $shortcutInstalled -InstallDir $installDir -CodexExe $codexExe
Write-Output $installedIcon
