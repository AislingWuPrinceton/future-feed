"""Turn the generated felt pictures in static/art/raw/ into the pieces the town uses (static/art/).

- background.png, room.png  -> resized backdrops
- <kind>.png (hall, library, ...) -> <kind>_roof / <kind>_floor / <kind>_ground cut-outs
- scenery.png -> scenery_<n> cut-outs, numbered left to right, top to bottom

Works with transparent PNGs or with a plain white background (removed by flood fill from the edges).
Run: .venv/bin/python scripts/slice_art.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "static" / "art"
RAW = ROOT / "raw"
KINDS = ["hall", "library", "cafe", "home", "gym", "garden", "studio"]
KEY = (255, 0, 255)


def cut_out(img):
    """RGBA with the background transparent."""
    img = img.convert("RGBA")
    a = np.array(img)
    if (a[..., 3] < 250).mean() > 0.05:  # already has a transparent background
        return img
    rgb = img.convert("RGB")
    w, h = rgb.size
    seeds = [(x, y) for x in range(0, w, max(1, w // 24)) for y in (0, h - 1)] + \
            [(x, y) for y in range(0, h, max(1, h // 24)) for x in (0, w - 1)]
    for s in seeds:
        if rgb.getpixel(s) != KEY and min(rgb.getpixel(s)) > 200:
            ImageDraw.floodfill(rgb, s, KEY, thresh=38)
    mask = np.all(np.array(rgb) == KEY, axis=-1)
    alpha = Image.fromarray(np.where(mask, 0, 255).astype("uint8"))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # trim the white halo
    img.putalpha(alpha)
    return img


def runs(occupied, min_gap):
    """[start, end) runs of True, merging gaps shorter than min_gap."""
    out, start, gap = [], None, 0
    for i, on in enumerate(list(occupied) + [False] * min_gap):
        if on:
            if start is None:
                start = i
            gap, end = 0, i + 1
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                out.append((start, end))
                start = None
    return out


def trim(img):
    box = img.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return img.crop(box) if box else img


def pieces(img, min_gap=10):
    """Split a sheet of separate items: bands of rows, then columns within each band."""
    a = np.array(img.getchannel("A")) > 24
    out = []
    for y0, y1 in runs(a.sum(1) > 2, min_gap):
        band = a[y0:y1]
        for x0, x1 in runs(band.sum(0) > 2, min_gap):
            p = trim(img.crop((x0, y0, x1, y1)))
            if p.width * p.height > 1500:
                out.append(p)
    return out


def save(img, name, width):
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(ROOT / f"{name}.webp", quality=88, method=6)
    print(f"  {name}.webp {img.width}x{img.height}")


def main():
    ROOT.mkdir(exist_ok=True)
    for name, width in (("background", 2000), ("room", 400)):
        f = RAW / f"{name}.png"
        if f.exists():
            img = Image.open(f).convert("RGB")
            if img.width > width:
                img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
            img.save(ROOT / f"{name}.jpg", quality=86, optimize=True)
            print(f"{name}.jpg {img.width}x{img.height}")
    for kind in KINDS:
        f = RAW / f"{kind}.png"
        if not f.exists():
            continue
        found = pieces(cut_out(Image.open(f)), min_gap=14)
        keep = sorted(sorted(range(len(found)), key=lambda i: -found[i].width * found[i].height)[:3])  # 3 biggest, top to bottom
        print(f"{kind}: {len(found)} pieces")
        if len(keep) != 3:
            print("  !! expected roof, floor and ground floor; check the picture")
            continue
        for p, role in zip((found[i] for i in keep), ("roof", "floor", "ground")):
            save(p, f"{kind}_{role}", 420)
    f = RAW / "scenery.png"
    if f.exists():
        parts = pieces(cut_out(Image.open(f)))
        print(f"scenery: {len(parts)} pieces")
        for i, p in enumerate(parts):
            save(p, f"scenery_{i}", 360)
    # name -> [width, height], so the page can lay buildings out before the pictures load
    sizes = {f.name: list(Image.open(f).size) for f in sorted(ROOT.iterdir()) if f.suffix in (".webp", ".jpg")}
    (ROOT / "manifest.json").write_text(json.dumps(sizes, indent=1))
    print(f"manifest: {len(sizes)} files")


if __name__ == "__main__":
    main()
