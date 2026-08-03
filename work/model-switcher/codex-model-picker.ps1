param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('gpt', 'deepseek')]
    [string]$Provider,

    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

        if ($candidate) {
            return $candidate.FullName
        }
    }

    $command = Get-Command 'codex.exe' -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    throw 'Codex CLI was not found. Start the Codex desktop app once, then try again.'
}

function Convert-SecureStringToPlainText {
    param([Security.SecureString]$SecureValue)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Get-DeepSeekApiKey {
    if ($env:DEEPSEEK_API_KEY) {
        return $env:DEEPSEEK_API_KEY
    }

    $secretPath = Join-Path $PSScriptRoot 'deepseek-api-key.dpapi'
    if (Test-Path -LiteralPath $secretPath) {
        try {
            $encrypted = [IO.File]::ReadAllText($secretPath).Trim()
            $secureValue = ConvertTo-SecureString $encrypted
            return Convert-SecureStringToPlainText $secureValue
        } catch {
            throw "The saved DeepSeek key could not be decrypted. Delete this file and retry: $secretPath"
        }
    }

    Write-Host ''
    Write-Host 'DeepSeek API key setup (first launch only)' -ForegroundColor Cyan
    Write-Host 'Create or inspect your key at: https://platform.deepseek.com/api_keys'
    Write-Host 'The key will be encrypted with Windows DPAPI for the current Windows user.'
    Write-Host ''

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $secureValue = Read-Host 'Enter your DeepSeek API key (starts with sk-)' -AsSecureString
        $plainValue = Convert-SecureStringToPlainText $secureValue
        if ($plainValue -clike 'sk-*') {
            $encrypted = ConvertFrom-SecureString $secureValue
            $utf8NoBom = New-Object Text.UTF8Encoding($false)
            [IO.File]::WriteAllText($secretPath, $encrypted + [Environment]::NewLine, $utf8NoBom)
            return $plainValue
        }

        $plainValue = $null
        Write-Host 'The key must start with sk-.' -ForegroundColor Yellow
    }

    throw 'No valid DeepSeek API key was provided.'
}

try {
    $codexExe = Find-CodexExecutable
    $workspaceRoot = Join-Path $env:USERPROFILE 'Documents\Codex'
    if (-not (Test-Path -LiteralPath $workspaceRoot)) {
        $workspaceRoot = $env:USERPROFILE
    }

    if ($Provider -eq 'gpt') {
        $profileName = 'gpt'
        $displayName = 'Codex - GPT task picker'
    } else {
        $profileName = 'deepseek'
        $displayName = 'Codex - DeepSeek task picker'
        if (-not $DryRun) {
            $deepSeekKey = Get-DeepSeekApiKey
            $env:DEEPSEEK_API_KEY = $deepSeekKey
        }
    }

    try { $Host.UI.RawUI.WindowTitle = $displayName } catch {}

    $codexArguments = @('--profile', $profileName, 'resume', '--all')
    if ($DryRun) {
        Write-Host "Executable: $codexExe"
        Write-Host "Arguments:  $($codexArguments -join ' ')"
        Write-Host "Start in:   $workspaceRoot"
        exit 0
    }

    Set-Location -LiteralPath $workspaceRoot
    & $codexExe @codexArguments
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Host ''
        Write-Host "Codex exited with code $exitCode." -ForegroundColor Red
        Read-Host 'Press Enter to close this window'
    }
    exit $exitCode
} catch {
    Write-Host ''
    Write-Host '[Launcher error]' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    Read-Host 'Press Enter to close this window'
    exit 1
}
