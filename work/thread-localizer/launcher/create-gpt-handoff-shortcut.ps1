[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [string]$InstallRoot = '',
    [string]$IconPath = '',
    [string]$ShortcutPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$scriptPath = Join-Path $PSScriptRoot 'create-handoff-shortcuts.ps1'
if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) { throw "找不到双入口创建器：$scriptPath" }
$desktop = if ($ShortcutPath) { Split-Path -Parent ([IO.Path]::GetFullPath($ShortcutPath)) } else { '' }
& $scriptPath -InstallRoot $InstallRoot -DesktopPath $desktop -Provider gpt -GptIconPath $IconPath -WhatIf:$WhatIfPreference -Confirm:$false
