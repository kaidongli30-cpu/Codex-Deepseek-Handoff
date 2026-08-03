$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$pairs = @(
    @('C:\Users\Lenovo\.codex\model-switcher\gpt.ico', 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher\gpt-preview.png'),
    @('C:\Users\Lenovo\.codex\model-switcher\deepseek.ico', 'C:\Users\Lenovo\Documents\Codex\2026-08-01\codex-codex-codex-cli-codex-chatgpt\work\model-switcher\deepseek-preview.png')
)

foreach ($pair in $pairs) {
    $icon = New-Object Drawing.Icon($pair[0])
    $bitmap = $icon.ToBitmap()
    try {
        $bitmap.Save($pair[1], [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $bitmap.Dispose()
        $icon.Dispose()
    }
    Write-Output $pair[1]
}
