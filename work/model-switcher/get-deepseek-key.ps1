$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$installRoot = if ($env:CODEX_MODEL_SWITCHER_ROOT) {
    [IO.Path]::GetFullPath($env:CODEX_MODEL_SWITCHER_ROOT)
} else {
    $PSScriptRoot
}
$secretPath = Join-Path $installRoot 'deepseek-api-key.dpapi'
if (-not (Test-Path -LiteralPath $secretPath)) {
    [Console]::Error.WriteLine('DeepSeek API key is not configured. Use the DeepSeek desktop shortcut first.')
    exit 1
}

try {
    $encrypted = [IO.File]::ReadAllText($secretPath).Trim()
    $secureValue = ConvertTo-SecureString $encrypted
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }

    if ($plainValue -cnotlike 'sk-*') {
        throw 'The decrypted key does not start with sk-.'
    }

    [Console]::Out.WriteLine($plainValue)
    $plainValue = $null
    exit 0
} catch {
    [Console]::Error.WriteLine('The saved DeepSeek API key could not be decrypted for this Windows user.')
    exit 1
}
