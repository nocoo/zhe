# Zhe logo assets

The original animal is retained byte-for-byte. This Refined pass adds a beeswax cells background, fine grain, and shallow contact shadows. No image model was called, and the animal was not cropped, moved, recolored, or redrawn.

## Asset roles

| Surface | Asset | Treatment |
| --- | --- | --- |
| README header | `assets/brand/icon-rounded.png` at 128 px | Selected presentation |
| Expanded / collapsed sidebar | `public/logo-24.png` at 24 CSS px | Transparent original, no image corner mask |
| Landing badge | `public/logo-80.png` | Transparent original within the existing badge layout |
| Browser icon | `app/icon.png` at 32 px; `app/favicon.ico` at 16/32 px | Transparent original in every resolution |
| Apple touch icon | `app/apple-icon.png` at 180 px | Square presentation; Apple supplies platform masking |
| Open Graph image | `app/opengraph-image.png` at 1200 × 630 | Rounded presentation on the existing purple social canvas |

Root `logo.png` is the canonical 2048 × 2048 transparent source. `icon.png` and `icon-rounded.png` in this directory are separate square and rounded presentations at the same native dimensions. Small app and browser marks must keep their alpha and must not receive the presentation background, a drop shadow, or an extra CSS crop.

## Reproduce and verify

Run from the repository root:

```sh
uv run --with pillow python scripts/resize-logos.py
```

The background recipe, exact original, palette samples, every size, and frozen finishing layers are archived in `nocoo/hexly.ai` under `artwork/logo-family/zhe/2026-09-07-01/finishing/01`. [source.json](source.json) records the source revision and all master SHA-256 values.

- [Individual logo review](https://hexly.ai/logos/zhe)
- [Local static study](https://index.dev.hexly.ai/artwork/logo-family/zhe/2026-09-07-01/review.html)
- [Shared logo usage SOP](https://github.com/nocoo/hexly.ai/blob/main/docs/07-logo-usage-sop.md)

Before/after deliberately shares the same foreground. Check the background presentation at large sizes, both sidebar states, and transparent browser marks on both light and dark. Decode every ICO resolution after regeneration.
