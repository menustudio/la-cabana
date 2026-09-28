# -*- coding: utf-8 -*-
"""
ADIC2 La Cabana — brand asset pipeline.

Turns the qlub logo (assets/logo/logo-source.png: copper wordmark on white)
into a transparent wordmark in two inks plus every icon the site needs.
Re-run after replacing logo-source.png.

Outputs (assets/logo/)
  logo-copper.png / .webp      transparent wordmark, copper   (light screens)
  logo-champagne.png / .webp   transparent wordmark, champagne (dark screens)
  icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
  favicon.png (64px), og-image.jpg (1200x630)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "assets" / "logo" / "logo-source.png"
OUT = ROOT / "assets" / "logo"

COPPER = (176, 122, 75)       # sampled from the logo
CHAMPAGNE = (226, 196, 158)
IVORY = (246, 241, 234)
NAVY = (18, 26, 40)


def wordmark_alpha() -> Image.Image:
    """Alpha mask of the wordmark: how far each pixel is from the white paper."""
    im = Image.open(LOGO).convert("RGB")
    lum = im.convert("L")
    ink = sum(c * w for c, w in zip(COPPER, (0.299, 0.587, 0.114)))
    alpha = lum.point(lambda v: max(0, min(255, round((255 - v) / (255 - ink) * 255))))
    # the source carries a faint grey strip along its bottom edge — the box of
    # strong ink excludes it, everything outside the box is cleared
    box = alpha.point(lambda v: 255 if v > 110 else 0).getbbox()
    pad = round(max(box[2] - box[0], box[3] - box[1]) * 0.03)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
    return alpha.crop(box)


def inked(alpha: Image.Image, color) -> Image.Image:
    out = Image.new("RGBA", alpha.size, color + (0,))
    out.putalpha(alpha)
    return out


def on_square(mark: Image.Image, side: int, bg, width_frac: float) -> Image.Image:
    canvas = Image.new("RGB", (side, side), bg)
    w = round(side * width_frac)
    h = round(mark.height * w / mark.width)
    m = mark.resize((w, h), Image.LANCZOS)
    canvas.paste(m, ((side - w) // 2, (side - h) // 2), m)
    return canvas


def main():
    alpha = wordmark_alpha()
    copper, champagne = inked(alpha, COPPER), inked(alpha, CHAMPAGNE)
    for name, mark in (("logo-copper", copper), ("logo-champagne", champagne)):
        m = mark.copy()
        m.thumbnail((1200, 1200), Image.LANCZOS)
        m.save(OUT / f"{name}.png", optimize=True)
        m.save(OUT / f"{name}.webp", "WEBP", quality=90, method=6)

    on_square(copper, 192, IVORY, .84).save(OUT / "icon-192.png", optimize=True)
    on_square(copper, 512, IVORY, .84).save(OUT / "icon-512.png", optimize=True)
    on_square(copper, 512, IVORY, .66).save(OUT / "icon-maskable-512.png", optimize=True)
    on_square(copper, 180, IVORY, .84).save(OUT / "apple-touch-icon.png", optimize=True)
    on_square(copper, 64, IVORY, .92).save(OUT / "favicon.png", optimize=True)

    og = Image.new("RGB", (1200, 630), NAVY)
    w = 760
    m = champagne.resize((w, round(champagne.height * w / champagne.width)), Image.LANCZOS)
    og.paste(m, ((1200 - w) // 2, (630 - m.height) // 2), m)
    og.save(OUT / "og-image.jpg", quality=88, optimize=True)
    print("brand assets written:", alpha.size)


if __name__ == "__main__":
    main()
