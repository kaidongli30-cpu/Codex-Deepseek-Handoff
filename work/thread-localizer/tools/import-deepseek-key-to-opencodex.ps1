$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$keyHelper = Join-Path $env:USERPROFILE '.codex\model-switcher\get-deepseek-key.ps1'
$ocxRoot = Join-Path $env:APPDATA 'npm\node_modules\@bitkyc08\opencodex'
$ocxEntry = Join-Path $ocxRoot 'bin\ocx.mjs'
$node = (Get-Command node.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $ocxEntry)) { throw "Missing opencodex CLI: $ocxEntry" }

$secretPath = Join-Path $env:USERPROFILE '.codex\model-switcher\deepseek-api-key.dpapi'
if (-not (Test-Path -LiteralPath $secretPath)) { throw "Missing saved DeepSeek key: $secretPath" }
$encrypted = [IO.File]::ReadAllText($secretPath).Trim()
$secureValue = ConvertTo-SecureString $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
if (-not $key -or $key -notlike 'sk-*') { throw 'Could not read a valid DeepSeek API key.' }

$startInfo = [Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $node
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Arguments = '"' + $ocxEntry + '" account add-key deepseek --label official --json'

$process = [Diagnostics.Process]::new()
$process.StartInfo = $startInfo
[void]$process.Start()
$process.StandardInput.WriteLine($key)
$process.StandardInput.Close()
$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()
$key = $null

if ($process.ExitCode -ne 0) {
    throw ("opencodex import failed: " + $stderr.Trim())
}

[ordered]@{
    imported = $true
    provider = 'deepseek'
} | ConvertTo-Json -Compress
