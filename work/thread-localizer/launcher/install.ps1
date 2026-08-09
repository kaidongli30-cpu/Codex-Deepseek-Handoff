[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [string]$SourceRoot = '',
    [string]$InstallRoot = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $SourceRoot) {
    $toolSource = Split-Path -Parent $PSScriptRoot
    $SourceRoot = Split-Path -Parent (Split-Path -Parent $toolSource)
}
if (-not $InstallRoot) {
    $InstallRoot = Join-Path (Join-Path $env:USERPROFILE '.codex') 'model-switcher'
}

$SourceRoot = [IO.Path]::GetFullPath($SourceRoot)
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
$threadSource = Join-Path $SourceRoot 'work\thread-localizer'
$modelSource = Join-Path $SourceRoot 'work\model-switcher'

foreach ($requiredPath in @(
        (Join-Path $threadSource 'src'),
        (Join-Path $threadSource 'data\handoff-settings.json'),
        (Join-Path $threadSource 'package.json'),
        (Join-Path $threadSource 'launcher\codex-desktop-model-launcher.ps1'),
        (Join-Path $modelSource 'models-deepseek.json'),
        (Join-Path $modelSource 'get-deepseek-key.ps1')
    )) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "安装源不完整，找不到：$requiredPath"
    }
}

function Copy-FileChecked {
    param([string]$Source, [string]$Destination)
    if ($PSCmdlet.ShouldProcess($Destination, "复制 $Source")) {
        $parent = Split-Path -Parent $Destination
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    }
}

function Copy-DirectoryChecked {
    param([string]$Source, [string]$Destination)
    if ($PSCmdlet.ShouldProcess($Destination, "复制目录 $Source")) {
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
    }
}

if ($PSCmdlet.ShouldProcess($InstallRoot, '创建 Codex-DeepSeek-Handoff 安装目录')) {
    New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
}

Copy-FileChecked (Join-Path $threadSource 'launcher\codex-desktop-model-launcher.ps1') (Join-Path $InstallRoot 'codex-desktop-model-launcher.ps1')
Copy-FileChecked (Join-Path $threadSource 'launcher\create-gpt-handoff-shortcut.ps1') (Join-Path $InstallRoot 'create-gpt-handoff-shortcut.ps1')
Copy-FileChecked (Join-Path $modelSource 'get-deepseek-key.ps1') (Join-Path $InstallRoot 'get-deepseek-key.ps1')
Copy-FileChecked (Join-Path $modelSource 'models-deepseek.json') (Join-Path $InstallRoot 'models-deepseek.json')
Copy-DirectoryChecked (Join-Path $threadSource 'src') (Join-Path $InstallRoot 'thread-localizer\src')
Copy-FileChecked (Join-Path $threadSource 'data\handoff-settings.json') (Join-Path $InstallRoot 'thread-localizer\data\handoff-settings.json')
Copy-FileChecked (Join-Path $threadSource 'package.json') (Join-Path $InstallRoot 'thread-localizer\package.json')
Copy-FileChecked (Join-Path $threadSource 'README.md') (Join-Path $InstallRoot 'thread-localizer\README.md')

$manifest = [ordered]@{
    product = 'Codex-DeepSeek-Handoff'
    installedAt = [DateTime]::UtcNow.ToString('o')
    sourceRoot = $SourceRoot
    installRoot = $InstallRoot
    handoffRoot = (Join-Path $InstallRoot 'thread-localizer')
    files = @(
        'codex-desktop-model-launcher.ps1',
        'create-gpt-handoff-shortcut.ps1',
        'get-deepseek-key.ps1',
        'models-deepseek.json',
        'thread-localizer\src',
        'thread-localizer\data\handoff-settings.json',
        'thread-localizer\package.json',
        'thread-localizer\README.md'
    )
    secretFilePreserved = 'deepseek-api-key.dpapi is never created or overwritten by this installer.'
}
$manifestPath = Join-Path $InstallRoot 'install-manifest.json'
if ($PSCmdlet.ShouldProcess($manifestPath, '写入安装清单')) {
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

[ordered]@{
    sourceRoot = $SourceRoot
    installRoot = $InstallRoot
    handoffRoot = (Join-Path $InstallRoot 'thread-localizer')
    whatIf = [bool]$WhatIfPreference
    next = '如需创建快捷方式，请单独运行 create-gpt-handoff-shortcut.ps1。'
} | ConvertTo-Json
