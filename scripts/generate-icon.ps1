$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 512
$bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$inset = 24
$diameter = 112
$bounds = [System.Drawing.Rectangle]::new($inset, $inset, $size - 2 * $inset, $size - 2 * $inset)
$path.AddArc($bounds.Left, $bounds.Top, $diameter, $diameter, 180, 90)
$path.AddArc($bounds.Right - $diameter, $bounds.Top, $diameter, $diameter, 270, 90)
$path.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
$path.AddArc($bounds.Left, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
$path.CloseFigure()

$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $bounds,
  [System.Drawing.Color]::FromArgb(111, 92, 255),
  [System.Drawing.Color]::FromArgb(48, 111, 238),
  45
)
$graphics.FillPath($gradient, $path)

$glow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34, 255, 255, 255))
$graphics.FillEllipse($glow, 58, 45, 320, 260)

$whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 28)
$whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$center = 256
$graphics.DrawLine($whitePen, $center, 126, $center, 386)
$graphics.DrawLine($whitePen, 126, $center, 386, $center)
$graphics.DrawLine($whitePen, 168, 168, 344, 344)
$graphics.DrawLine($whitePen, 344, 168, 168, 344)

$core = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
$graphics.FillEllipse($core, 222, 222, 68, 68)

$assetDirectory = Join-Path $PSScriptRoot '..\assets'
New-Item -ItemType Directory -Force -Path $assetDirectory | Out-Null
$output = Join-Path $assetDirectory 'icon.png'
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)

$core.Dispose()
$whitePen.Dispose()
$glow.Dispose()
$gradient.Dispose()
$path.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $output
