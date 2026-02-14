#!/bin/bash

# Generate logo variants from logo-light and logo-dark source images.
# Sources: logo-light.jpg and logo-dark.jpg in project root.
# Outputs: public/ directory with themed + favicon variants.
#
# Usage: ./scripts/generate-logos.sh
#
# Favicon and apple-touch-icon use the light variant by default,
# since they cannot switch with the OS theme.

set -e

LIGHT_SRC="logo-light.jpg"
DARK_SRC="logo-dark.jpg"
OUTPUT_DIR="public"

# Validate sources
for src in "$LIGHT_SRC" "$DARK_SRC"; do
  if [ ! -f "$src" ]; then
    echo "Error: $src not found in project root"
    exit 1
  fi
done

# Check for sips (macOS)
if ! command -v sips &> /dev/null; then
  echo "Error: sips command not found (macOS only)"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# Helper: resize a source to a given size and output path
resize() {
  local src="$1" size="$2" out="$3"
  # sips can read jpg and write png via --setProperty format
  sips -z "$size" "$size" "$src" --setProperty format png --out "$out" > /dev/null 2>&1
}

echo "Generating logo variants..."
echo "  Light source: $LIGHT_SRC"
echo "  Dark source:  $DARK_SRC"
echo ""

# ============================================
# 1. Themed logo pairs (light + dark)
#    Used in sidebar and signin page.
#    CSS class switching: block dark:hidden / hidden dark:block
# ============================================

echo "Themed logo pairs:"

# Sidebar (24px)
echo "  -> logo-light-24.png / logo-dark-24.png  (sidebar)"
resize "$LIGHT_SRC" 24 "$OUTPUT_DIR/logo-light-24.png"
resize "$DARK_SRC"  24 "$OUTPUT_DIR/logo-dark-24.png"

# Signin page (80px)
echo "  -> logo-light-80.png / logo-dark-80.png  (signin page)"
resize "$LIGHT_SRC" 80 "$OUTPUT_DIR/logo-light-80.png"
resize "$DARK_SRC"  80 "$OUTPUT_DIR/logo-dark-80.png"

# ============================================
# 2. Favicon / system icons (light variant only)
#    These cannot respond to OS theme, so we default to light.
# ============================================

echo ""
echo "Favicon and system icons (light variant):"

echo "  -> favicon.png         (32x32  - browser tab)"
resize "$LIGHT_SRC" 32  "$OUTPUT_DIR/favicon.png"

echo "  -> favicon-16.png      (16x16  - small favicon)"
resize "$LIGHT_SRC" 16  "$OUTPUT_DIR/favicon-16.png"

echo "  -> apple-touch-icon.png (180x180 - iOS home screen)"
resize "$LIGHT_SRC" 180 "$OUTPUT_DIR/apple-touch-icon.png"

echo "  -> icon-192.png        (192x192 - Android/PWA)"
resize "$LIGHT_SRC" 192 "$OUTPUT_DIR/icon-192.png"

echo "  -> icon-512.png        (512x512 - PWA splash)"
resize "$LIGHT_SRC" 512 "$OUTPUT_DIR/icon-512.png"

# ============================================
# 3. Clean up legacy single-theme logos
# ============================================
echo ""
for legacy in logo-32.png logo-48.png logo-128.png logo-256.png; do
  if [ -f "$OUTPUT_DIR/$legacy" ]; then
    echo "  Removing legacy $legacy"
    rm "$OUTPUT_DIR/$legacy"
  fi
done

# ============================================
# Summary
# ============================================
echo ""
echo "Generated files in $OUTPUT_DIR/:"
ls -la "$OUTPUT_DIR"/*.png
echo ""
echo "Usage in components:"
echo "  Sidebar (24px):"
echo "    <img src=\"/logo-light-24.png\" className=\"block dark:hidden\" />"
echo "    <img src=\"/logo-dark-24.png\"  className=\"hidden dark:block\" />"
echo ""
echo "  Signin (80px):"
echo "    <img src=\"/logo-light-80.png\" className=\"block dark:hidden\" />"
echo "    <img src=\"/logo-dark-80.png\"  className=\"hidden dark:block\" />"
echo ""
echo "  Favicon: served from public/favicon.png (light variant, 32x32)"
echo ""
echo "Done!"
