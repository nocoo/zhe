#!/bin/bash

# Generate logo variants from a single transparent-background source image.
# Source: logo-new.png in project root.
# Outputs: public/ directory with all icon variants.
#
# Usage: ./scripts/generate-logos.sh

set -e

SRC="logo-new.png"
OUTPUT_DIR="public"

if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found in project root"
  exit 1
fi

# Check for sips (macOS)
if ! command -v sips &> /dev/null; then
  echo "Error: sips command not found (macOS only)"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Helper: resize source to a given size and output path
resize() {
  local size="$1" out="$2"
  sips -z "$size" "$size" "$SRC" --setProperty format png --out "$out" > /dev/null 2>&1
}

echo "Generating logo variants from $SRC..."
echo ""

# ============================================
# 1. App logo (transparent background, works on any theme)
# ============================================

echo "App logos:"

# Sidebar (24px)
echo "  -> logo-24.png   (sidebar)"
resize 24 "$OUTPUT_DIR/logo-24.png"

# README (128px — GitHub markdown, matches header spec)
echo "  -> logo-128.png  (README)"
resize 128 "$OUTPUT_DIR/logo-128.png"

# Signin page (320px — displayed at 96px CSS, ~3.3x for retina)
echo "  -> logo-320.png  (signin page, retina)"
resize 320 "$OUTPUT_DIR/logo-320.png"

# ============================================
# 2. Favicon / system icons
#    Next.js file-based metadata: icon.png + apple-icon.png go in app/
#    public/ copies kept for backward compat (PWA manifest, etc.)
# ============================================

echo ""
echo "Favicon and system icons:"

echo "  -> favicon.png         (32x32  - browser tab)"
resize 32  "$OUTPUT_DIR/favicon.png"

echo "  -> favicon-16.png      (16x16  - small favicon)"
resize 16  "$OUTPUT_DIR/favicon-16.png"

echo "  -> apple-touch-icon.png (180x180 - iOS home screen)"
resize 180 "$OUTPUT_DIR/apple-touch-icon.png"

echo "  -> icon-192.png        (192x192 - Android/PWA)"
resize 192 "$OUTPUT_DIR/icon-192.png"

echo "  -> icon-512.png        (512x512 - PWA splash)"
resize 512 "$OUTPUT_DIR/icon-512.png"

# Next.js file-based metadata convention (app/ directory)
echo ""
echo "Next.js file-based metadata icons:"

echo "  -> app/icon.png        (32x32  - auto <link rel='icon'>)"
resize 32  "app/icon.png"

echo "  -> app/apple-icon.png  (180x180 - auto <link rel='apple-touch-icon'>)"
resize 180 "app/apple-icon.png"

echo "  -> app/favicon.ico     (16+32 multi-size ICO)"
python3 -c "
from PIL import Image
logo = Image.open('logo-new.png').convert('RGBA')
s16 = logo.resize((16,16), Image.LANCZOS)
s32 = logo.resize((32,32), Image.LANCZOS)
s32.save('app/favicon.ico', format='ICO', append_images=[s16], sizes=[(16,16),(32,32)])
"

# ============================================
# 3. OpenGraph image (1200x630, brand bg, centered logo)
#    Placed in app/ for Next.js file-based metadata convention
# ============================================

echo ""
echo "OpenGraph image:"
echo "  -> app/opengraph-image.png (1200x630 - social sharing)"

python3 << 'PYEOF'
from PIL import Image
import colorsys

# Brand color: hsl(262, 83%, 58%)
h, s, l = 262/360, 0.83, 0.58
r, g, b = colorsys.hls_to_rgb(h, l, s)
bg = (int(r*255), int(g*255), int(b*255))

canvas = Image.new("RGB", (1200, 630), bg)
logo = Image.open("logo-new.png").convert("RGBA")

target_h = int(630 * 0.40)
ratio = target_h / logo.height
target_w = int(logo.width * ratio)
logo_r = logo.resize((target_w, target_h), Image.LANCZOS)

x = (1200 - target_w) // 2
y = (630 - target_h) // 2 - 20

canvas.paste(logo_r, (x, y), logo_r)
canvas.save("app/opengraph-image.png", "PNG")
PYEOF

# ============================================
# 4. Clean up old themed logo files
# ============================================
echo ""
echo "Cleaning up old themed logos..."
for legacy in logo-light-24.png logo-dark-24.png logo-light-80.png logo-light-320.png logo-dark-320.png logo-dark-80.png logo-light-160.png logo-dark-160.png logo-32.png logo-48.png logo-80.png logo-256.png; do
  if [ -f "$OUTPUT_DIR/$legacy" ]; then
    echo "  Removing $legacy"
    rm "$OUTPUT_DIR/$legacy"
  fi
done

# ============================================
# Summary
# ============================================
echo ""
echo "Generated files in $OUTPUT_DIR/:"
ls -la "$OUTPUT_DIR"/logo-*.png "$OUTPUT_DIR"/favicon*.png "$OUTPUT_DIR"/apple-touch-icon.png "$OUTPUT_DIR"/icon-*.png 2>/dev/null
echo ""
echo "Usage in components:"
echo "  Sidebar (24px):  <img src=\"/logo-24.png\" />"
echo "  Signin (320px):  <img src=\"/logo-320.png\" />"
echo "  Favicon: served from public/favicon.png (32x32)"
echo ""
echo "Done!"
