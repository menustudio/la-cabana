# -*- coding: utf-8 -*-
"""
ADIC2 La Cabana — image pipeline.

Reads tools/sources.json (slug -> original qlub photo, written by
qlub-sync.py) and writes square web assets named by slug. Idempotent: skips
outputs newer than their source.

The qlub photos are studio shots on a navy satin sheet (food) or grey
concrete (coffee), often wide, with the plate small in the middle. Each one
is cropped to a square around the plate — the backdrop is recognised and
ignored, and the crop always stays inside the photograph so no flat bands
appear. Plain-white product shots (cans, bottles) are padded instead of
cropped so a tall bottle is never cut.

Outputs
  assets/images/dishes/{slug}.{avif,webp,jpg}      1000px  (+ -sm 560px)
  assets/images/items/{slug}.{avif,webp,jpg}        480px  (+ -sm 240px)
  assets/images/welcome.{avif,webp,jpg}            1000px  (+ -sm 600px)
  assets/images/items/shisha-cover.*                900px  (+ -sm 480px)
"""
import json
import sys
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "tools" / "sources.json"
MENU = ROOT / "data" / "menu.json"
CATEGORIES = ROOT / "data" / "categories.json"
DISHES_OUT = ROOT / "assets" / "images" / "dishes"
ITEMS_OUT = ROOT / "assets" / "images" / "items"
IMAGES_OUT = ROOT / "assets" / "images"

# art-directed picks from the synced photos (slugs from data/menu.json)
WELCOME_SLUG = "adicto-mix-grill"
SHISHA_SLUG = "shisha-mix"

AVIF = features.check("avif")
IVORY = (246, 241, 234)


def load_rgb(path: Path) -> Image.Image:
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert("RGB")


def _border_stats(small):
    w, h = small.size
    px = small.load()
    edge = [px[x, y] for x in range(w) for y in (0, 1, h - 2, h - 1)] + \
           [px[x, y] for y in range(h) for x in (0, 1, w - 2, w - 1)]
    med = tuple(sorted(c[i] for c in edge)[len(edge) // 2] for i in range(3))
    spread = sum(abs(c[0] - med[0]) + abs(c[1] - med[1]) + abs(c[2] - med[2]) for c in edge) / len(edge)
    return med, spread


def _is_backdrop(c, bg):
    r, g, b = c
    # navy satin: blue dominant and not bright — its folds and highlights vary
    # a lot in brightness, so colour (not distance) is what identifies it
    if b > r + 12 and b >= g and max(c) < 215:
        return True
    # grey concrete / black: low saturation, close-ish to the border tone
    sat = max(c) - min(c)
    dist = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
    if sat < 22 and dist < 95:
        return True
    return dist < 40


def subject_box(im: Image.Image):
    """(x0, y0, x1, y1, plain_backdrop) of the subject in full-size pixels."""
    small = im.copy()
    small.thumbnail((320, 320))
    sw, sh = small.size
    bg, spread = _border_stats(small)
    px = small.load()
    xs, ys = [], []
    for y in range(sh):
        for x in range(sw):
            if not _is_backdrop(px[x, y], bg):
                xs.append(x)
                ys.append(y)
    plain = spread < 10 and min(bg) > 225          # clean white product shot
    fx, fy = im.width / sw, im.height / sh
    if len(xs) < sw * sh * 0.01:
        return 0, 0, im.width, im.height, plain
    xs.sort()
    ys.sort()
    q = lambda arr, p: arr[min(len(arr) - 1, int(len(arr) * p))]
    return (q(xs, .02) * fx, q(ys, .02) * fy, (q(xs, .98) + 1) * fx, (q(ys, .98) + 1) * fy, plain)


def square_around_subject(im: Image.Image, pad=0.12, min_frac=0.58) -> Image.Image:
    w, h = im.size
    x0, y0, x1, y1, plain = subject_box(im)
    bw, bh = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(bw, bh) * (1 + pad * 2)

    if plain:
        # white product shot: pad to a square so nothing is cut
        side = max(side, 1)
        canvas = Image.new("RGB", (round(side), round(side)), (255, 255, 255))
        crop = im.crop((round(max(0, cx - side / 2)), round(max(0, cy - side / 2)),
                        round(min(w, cx + side / 2)), round(min(h, cy + side / 2))))
        canvas.paste(crop, ((canvas.width - crop.width) // 2, (canvas.height - crop.height) // 2))
        return canvas

    # textured backdrop: crop INSIDE the photo. Never zoom in past min_frac of
    # the short side (the sources are small — too much zoom turns soft), never
    # beyond the short side (that would need invented backdrop).
    short = min(w, h)
    side = max(side, short * min_frac)
    side = min(side, short)
    left = min(max(cx - side / 2, 0), w - side)
    top = min(max(cy - side / 2, 0), h - side)
    return im.crop((round(left), round(top), round(left + side), round(top + side)))


def save_variants(im: Image.Image, out_dir: Path, slug: str, sizes):
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for label, px in sizes:
        suffix = "" if label == "lg" else f"-{label}"
        scale = min(1.0, px / max(im.size))
        variant = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS) if scale < 1 else im
        variant.save(out_dir / f"{slug}{suffix}.webp", "WEBP", quality=82, method=6)
        variant.save(out_dir / f"{slug}{suffix}.jpg", "JPEG", quality=84, optimize=True, progressive=True)
        written += [f"{slug}{suffix}.webp", f"{slug}{suffix}.jpg"]
        if AVIF:
            variant.save(out_dir / f"{slug}{suffix}.avif", "AVIF", quality=58)
            written.append(f"{slug}{suffix}.avif")
    return written


def fresh(src: Path, out_dir: Path, slug: str) -> bool:
    probe = out_dir / f"{slug}.webp"
    return probe.exists() and probe.stat().st_mtime >= max(src.stat().st_mtime, Path(__file__).stat().st_mtime)


def main():
    if not SOURCES.exists():
        sys.exit(f"sources map not found: {SOURCES} — run tools/qlub-sync.py first")
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    dishes = json.loads(MENU.read_text(encoding="utf-8"))["dishes"]
    layouts = {c["id"]: c.get("layout", "screens") for c in json.loads(CATEGORIES.read_text(encoding="utf-8"))}
    layout_of = {d["id"]: layouts.get(d["category"], "screens") for d in dishes}

    total = skipped = 0
    for slug, p in sorted(sources.items()):
        src = Path(p)
        layout = layout_of.get(slug, "screens")
        if layout == "list":
            continue                      # list rows carry no photo
        if layout == "grid":
            out_dir, sizes = ITEMS_OUT, [("lg", 480), ("sm", 240)]
        else:
            out_dir, sizes = DISHES_OUT, [("lg", 1000), ("sm", 560)]
        if fresh(src, out_dir, slug):
            skipped += 1
            continue
        files = save_variants(square_around_subject(load_rgb(src)), out_dir, slug, sizes)
        total += len(files)
        print(f"  {slug} ({len(files)} files)")

    for slug, key, out_dir, sizes, pad in (
        ("welcome", WELCOME_SLUG, IMAGES_OUT, [("lg", 1000), ("sm", 600)], .1),
        ("shisha-cover", SHISHA_SLUG, ITEMS_OUT, [("lg", 900), ("sm", 480)], .06),
    ):
        src = Path(sources.get(key, ""))
        if not src.is_file():
            print(f"  !! {slug}: source {key} missing")
            continue
        if fresh(src, out_dir, slug):
            skipped += 1
            continue
        total += len(save_variants(square_around_subject(load_rgb(src), pad=pad), out_dir, slug, sizes))
        print(f"  {slug} <- {key}")

    print(f"Done. {total} files written, {skipped} up to date. AVIF: {AVIF}")


if __name__ == "__main__":
    main()
