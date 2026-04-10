Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("D:\TraeCode\stock\stock-widget\src-tauri\icons\128x128.png")
$thumb = $img.GetThumbnailImage(256, 256, $null, [IntPtr]::Zero)
$icon = [System.Drawing.Icon]::FromHandle($thumb.GetHicon())
$fs = New-Object System.IO.FileStream("D:\TraeCode\stock\stock-widget\src-tauri\icons\icon.ico", [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$thumb.Dispose()
$img.Dispose()
Write-Host "done"
