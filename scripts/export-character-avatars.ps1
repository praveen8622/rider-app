# Turns the character art in D:\yatri-avatars (512px transparent PNGs, character in the middle)
# into app avatars: cropped to the character, on a coloured background, 256px JPEG.
#   powershell -ExecutionPolicy Bypass -File scripts\export-character-avatars.ps1
# Output: assets\avatars\<animal>.jpg. Originals are not changed.
param(
  [string]$Source = 'D:\yatri-avatars',
  [string]$Out = (Join-Path $PSScriptRoot '..\assets\avatars'),
  [int]$Size = 256
)

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class AvatarTool {
  // Bounding box of pixels that are visibly opaque.
  public static Rectangle OpaqueBounds(Bitmap bmp, byte threshold) {
    var rect = new Rectangle(0, 0, bmp.Width, bmp.Height);
    var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
    var bytes = new byte[data.Stride * bmp.Height];
    Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
    bmp.UnlockBits(data);
    int minX = bmp.Width, minY = bmp.Height, maxX = -1, maxY = -1;
    for (int y = 0; y < bmp.Height; y++) {
      int row = y * data.Stride;
      for (int x = 0; x < bmp.Width; x++) {
        if (bytes[row + x * 4 + 3] > threshold) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return rect;
    return Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
  }

  public static void Compose(string src, string dest, int size, Color inner, Color outer, float margin) {
    using (var bmp = new Bitmap(src)) {
      var b = OpaqueBounds(bmp, 20);
      // Square around the character, with a little room so ears and wheels aren't clipped.
      float side = Math.Max(b.Width, b.Height) * (1 + 2 * margin);
      float cx = b.X + b.Width / 2f, cy = b.Y + b.Height / 2f;
      var crop = new RectangleF(cx - side / 2, cy - side / 2, side, side);

      using (var canvas = new Bitmap(size, size, PixelFormat.Format24bppRgb))
      using (var g = Graphics.FromImage(canvas)) {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        // Background: soft radial glow, lighter in the middle, like a spotlight behind the rider.
        g.Clear(outer);
        using (var path = new GraphicsPath()) {
          path.AddEllipse(-size * 0.25f, -size * 0.25f, size * 1.5f, size * 1.5f);
          using (var brush = new PathGradientBrush(path)) {
            brush.CenterColor = inner;
            brush.SurroundColors = new[] { outer };
            g.FillRectangle(brush, 0, 0, size, size);
          }
        }
        g.DrawImage(bmp, new RectangleF(0, 0, size, size), crop, GraphicsUnit.Pixel);

        var jpeg = Array.Find(ImageCodecInfo.GetImageEncoders(), c => c.MimeType == "image/jpeg");
        var p = new EncoderParameters(1);
        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 86L);
        canvas.Save(dest, jpeg, p);
      }
    }
  }
}
'@

# Background per character: a light centre fading to a deeper tone.
$colors = @{
  bear    = @('#BFDBFE', '#3B82F6'); bull   = @('#FECACA', '#DC2626'); cat     = @('#E9D5FF', '#9333EA')
  cheetah = @('#FED7AA', '#EA580C'); eagle  = @('#BAE6FD', '#0284C7'); fox     = @('#FDE68A', '#D97706')
  horse   = @('#E7D3C3', '#92400E'); koala  = @('#CCFBF1', '#0D9488'); lion    = @('#FEF08A', '#CA8A04')
  otter   = @('#A5F3FC', '#0891B2'); panda  = @('#BBF7D0', '#16A34A'); penguin = @('#C7D2FE', '#4F46E5')
  rabbit  = @('#FBCFE8', '#DB2777'); tiger  = @('#FDBA74', '#C2410C'); turtle  = @('#D9F99D', '#65A30D')
  wolf    = @('#E2E8F0', '#475569')
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Out = (Resolve-Path $Out).Path
foreach ($file in Get-ChildItem -Path $Source -Filter 'yatri_*.png') {
  $animal = $file.BaseName -replace '^yatri_', ''
  $pair = $colors[$animal]
  if (-not $pair) { $pair = @('#E5E7EB', '#6B7280') }
  $dest = Join-Path $Out "$animal.jpg"
  [AvatarTool]::Compose($file.FullName, $dest, $Size,
    [System.Drawing.ColorTranslator]::FromHtml($pair[0]),
    [System.Drawing.ColorTranslator]::FromHtml($pair[1]), 0.15)
  '{0,-10} -> {1} ({2} KB)' -f $animal, (Split-Path $dest -Leaf), [math]::Round((Get-Item $dest).Length / 1KB)
}

