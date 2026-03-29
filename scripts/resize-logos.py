#!/usr/bin/env python3
"""
Resize logo.png (transparent background) for different use cases.

Single-source pattern: ONE master logo.png at project root generates ALL derived assets.

Outputs:
  public/          — Only assets referenced by <img src="..."> in components
    logo-24.png      Sidebar logo
    logo-80.png      Login/loading page logo

  app/             — Next.js file-based metadata convention (auto-generates <link>/<meta> tags)
    icon.png         32x32 favicon
    apple-icon.png   180x180 Apple touch icon
    favicon.ico      Multi-size ICO (16+32)
    opengraph-image.png  1200x630 OG image (RGB, brand background)

CRITICAL: Never duplicate icons in both public/ AND app/.
          app/ convention takes precedence for metadata icons.

NOTE: zhe has no src/ directory — app/ is directly at project root.
"""

from PIL import Image
from pathlib import Path
import colorsys


def resize_square(img: Image.Image, size: int) -> Image.Image:
    """Resize square image to target size with LANCZOS resampling."""
    return img.resize((size, size), Image.Resampling.LANCZOS)


def hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    """Convert HSL (CSS format: h=degrees, s=percent, l=percent) to RGB (0-255)."""
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s / 100)
    return int(r * 255), int(g * 255), int(b * 255)


def main():
    root = Path(__file__).parent.parent
    public = root / "public"
    app = root / "app"  # zhe has no src/ — app is at root
    public.mkdir(exist_ok=True)

    # Load single source image (transparent background)
    logo = Image.open(root / "logo.png").convert("RGBA")
    print(f"Source logo: {logo.size}")

    # === public/ — Only <img> referenced assets ===

    # Sidebar logo (24x24)
    sidebar = resize_square(logo, 24)
    sidebar.save(public / "logo-24.png")
    print(f"  public/logo-24.png: {sidebar.size}")

    # Login/loading page logo (80x80)
    login = resize_square(logo, 80)
    login.save(public / "logo-80.png")
    print(f"  public/logo-80.png: {login.size}")

    # === app/ — Next.js file-based metadata convention ===

    # icon.png (32x32) — auto-generates <link rel="icon">
    icon = resize_square(logo, 32)
    icon.save(app / "icon.png")
    print(f"  app/icon.png: {icon.size}")

    # apple-icon.png (180x180) — auto-generates <link rel="apple-touch-icon">
    apple = resize_square(logo, 180)
    apple.save(app / "apple-icon.png")
    print(f"  app/apple-icon.png: {apple.size}")

    # favicon.ico (multi-size: 16+32) — broad browser compat
    favicon_16 = resize_square(logo, 16)
    favicon_32 = resize_square(logo, 32)
    favicon_32.save(
        app / "favicon.ico",
        format="ICO",
        append_images=[favicon_16],
        sizes=[(16, 16), (32, 32)],
    )
    print(f"  app/favicon.ico: 16x16 + 32x32")

    # opengraph-image.png (1200x630) — auto-generates <meta property="og:image">
    # Brand background (Purple): HSL 262 83% 58%
    brand_color = hsl_to_rgb(262, 83, 58)
    og_width, og_height = 1200, 630

    # Create RGB canvas with brand background (social platforms don't support alpha)
    og = Image.new("RGB", (og_width, og_height), brand_color)

    # Center logo at ~40% canvas height
    logo_size = min(og_width, og_height) * 55 // 100  # ~55% of shorter dimension
    logo_resized = resize_square(logo, logo_size)

    # Convert RGBA logo to paste with alpha mask
    x = (og_width - logo_size) // 2
    y = int(og_height * 0.40) - logo_size // 2
    og.paste(logo_resized, (x, y), logo_resized)  # 3rd arg = alpha mask

    og.save(app / "opengraph-image.png")
    print(f"  app/opengraph-image.png: {og.size}")

    print("\nDone! All assets generated from single source.")


if __name__ == "__main__":
    main()
