$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$source = 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher\codex-model-picker.ps1'
$destination = 'C:\Users\Lenovo\.codex\model-switcher\codex-model-picker.ps1'

if (-not (Test-Path -LiteralPath $source)) { throw "Source not found: $source" }
if (-not (Test-Path -LiteralPath $destination)) { throw "Installed launcher not found: $destination" }

$scriptText = Get-Content -LiteralPath $source -Raw -Encoding UTF8
$utf8Bom = New-Object Text.UTF8Encoding($true)
[IO.File]::WriteAllText($destination, $scriptText, $utf8Bom)
Write-Output $destination
