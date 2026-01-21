#!/bin/bash

# Generate logo variants from the original logo.png
# Usage: ./scripts/generate-logos.sh

set -e

SOURCE="logo.png"
OUTPUT_DIR="public"

# Check if source exists
if [ ! -f "$SOURCE" ]; then
  echo "Error: $SOURCE not found"
  exit 1
fi

# Check if sips is available (macOS)
if ! command -v sips &> /dev/null; then
  echo "Error: sips command not found (macOS only)"
  exit 1
fi

echo "Generating logo variants from $SOURCE..."

# Create output directory
mkdir -p "$OUTPUT_DIR"

# ============================================
# 1. Homepage - Large logo
# ============================================
echo "  -> logo-256.png (Homepage)"
sips -z 256 256 "$SOURCE" --out "$OUTPUT_DIR/logo-256.png" > /dev/null

# ============================================
# 2. Login page - Medium logo  
# ============================================
echo "  -> logo-128.png (Login page)"
sips -z 128 128 "$SOURCE" --out "$OUTPUT_DIR/logo-128.png" > /dev/null

# ============================================
# 3. Sidebar - Small logo
# ============================================
echo "  -> logo-48.png (Sidebar)"
sips -z 48 48 "$SOURCE" --out "$OUTPUT_DIR/logo-48.png" > /dev/null

echo "  -> logo-32.png (Sidebar small)"
sips -z 32 32 "$SOURCE" --out "$OUTPUT_DIR/logo-32.png" > /dev/null

# ============================================
# 4. Favicon - Various sizes for different contexts
# ============================================
echo "  -> favicon.png (32x32 - browser tab)"
sips -z 32 32 "$SOURCE" --out "$OUTPUT_DIR/favicon.png" > /dev/null

echo "  -> favicon-16.png (16x16 - small favicon)"
sips -z 16 16 "$SOURCE" --out "$OUTPUT_DIR/favicon-16.png" > /dev/null

echo "  -> apple-touch-icon.png (180x180 - iOS)"
sips -z 180 180 "$SOURCE" --out "$OUTPUT_DIR/apple-touch-icon.png" > /dev/null

echo "  -> icon-192.png (192x192 - Android/PWA)"
sips -z 192 192 "$SOURCE" --out "$OUTPUT_DIR/icon-192.png" > /dev/null

echo "  -> icon-512.png (512x512 - PWA splash)"
sips -z 512 512 "$SOURCE" --out "$OUTPUT_DIR/icon-512.png" > /dev/null

# ============================================
# Summary
# ============================================
echo ""
echo "Generated files in $OUTPUT_DIR/:"
ls -la "$OUTPUT_DIR"/*.png

echo ""
echo "Done! Add these to your Next.js app:"
echo "  - Homepage:    <Image src=\"/logo-256.png\" ... />"
echo "  - Login:       <Image src=\"/logo-128.png\" ... />"
echo "  - Sidebar:     <Image src=\"/logo-48.png\" ... /> or logo-32.png"
echo "  - Favicon:     Already served from public/favicon.png"
