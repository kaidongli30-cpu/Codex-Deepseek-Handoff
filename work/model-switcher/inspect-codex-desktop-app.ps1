$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$package = Get-AppxPackage | Where-Object { $_.Name -eq 'OpenAI.Codex' } | Select-Object -First 1
if (-not $package) { throw 'OpenAI.Codex AppX package was not found.' }

$manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$applications = @($manifest.Package.Applications.Application | ForEach-Object {
    [ordered]@{
        id = $_.Id
        executable = $_.Executable
        entry_point = $_.EntryPoint
        app_user_model_id = $package.PackageFamilyName + '!' + $_.Id
    }
})

$startApps = @(Get-StartApps | Where-Object { $_.AppID -like ($package.PackageFamilyName + '*') } | ForEach-Object {
    [ordered]@{ name = $_.Name; app_id = $_.AppID }
})

[ordered]@{
    package_name = $package.Name
    package_family_name = $package.PackageFamilyName
    install_location = $package.InstallLocation
    applications = $applications
    start_apps = $startApps
} | ConvertTo-Json -Depth 5
