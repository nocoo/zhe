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

# README (80px — GitHub markdown)
echo "  -> logo-80.png   (README)"
resize 80 "$OUTPUT_DIR/logo-80.png"

# Signin page (320px — displayed at 96px CSS, ~3.3x for retina)
echo "  -> logo-320.png  (signin page, retina)"
resize 320 "$OUTPUT_DIR/logo-320.png"

# ============================================
# 2. Favicon / system icons
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

# ============================================
# 3. Clean up old themed logo files
# ============================================
echo ""
echo "Cleaning up old themed logos..."
for legacy in logo-light-24.png logo-dark-24.png logo-light-80.png logo-light-320.png logo-dark-320.png logo-dark-80.png logo-light-160.png logo-dark-160.png logo-32.png logo-48.png logo-128.png logo-256.png; do
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
