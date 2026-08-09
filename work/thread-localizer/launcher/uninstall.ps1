[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$InstallRoot = '',
    [switch]$RemoveEncryptedKey
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
$InstallRoot = [IO.Path]::GetFullPath($InstallRoot)
if (-not (Test-Path -LiteralPath $InstallRoot -PathType Container)) {
    [ordered]@{ installRoot = $InstallRoot; removed = @(); message = '安装目录不存在。' } | ConvertTo-Json
    exit 0
}

# Keep credentials by default. A user must opt in explicitly to remove the
# encrypted key, and this script never touches Codex task data or config.toml.
$knownFiles = @(
    'codex-desktop-model-launcher.ps1',
    'create-gpt-handoff-shortcut.ps1',
    'get-deepseek-key.ps1',
    'models-deepseek.json',
    'install-manifest.json'
)
$removed = New-Object System.Collections.Generic.List[string]
foreach ($relativePath in $knownFiles) {
    $path = Join-Path $InstallRoot $relativePath
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        if ($PSCmdlet.ShouldProcess($path, '删除项目安装文件')) {
            Remove-Item -LiteralPath $path -Force
            $removed.Add($path)
        }
    }
}

$threadRoot = Join-Path $InstallRoot 'thread-localizer'
if (Test-Path -LiteralPath $threadRoot -PathType Container) {
    if ($PSCmdlet.ShouldProcess($threadRoot, '删除项目交接工具目录')) {
        Remove-Item -LiteralPath $threadRoot -Recurse -Force
        $removed.Add($threadRoot)
    }
}

$secretPath = Join-Path $InstallRoot 'deepseek-api-key.dpapi'
if ($RemoveEncryptedKey -and (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
    if ($PSCmdlet.ShouldProcess($secretPath, '删除当前 Windows 用户的加密 DeepSeek key')) {
        Remove-Item -LiteralPath $secretPath -Force
        $removed.Add($secretPath)
    }
}

[ordered]@{
    installRoot = $InstallRoot
    removed = @($removed)
    encryptedKeyRemoved = [bool]($RemoveEncryptedKey -and ($removed -contains $secretPath))
    taskDataPreserved = $true
    configPreserved = $true
} | ConvertTo-Json
