"""Turn the generated felt pictures in static/art/raw/ into the pieces the town uses (static/art/).

- background*.png, scene_*.png, room_*.png -> resized backdrops (same name, .jpg)
- <kind>.png (hall, library, ...) -> <kind>_roof / <kind>_floor / <kind>_ground cut-outs
- scenery*.png -> prop_<name> cut-outs (see PROPS), numbered <sheet>_<n> if the count is off

Works with transparent PNGs or with a plain white background (removed by flood fill from the edges).
Run: .venv/bin/python scripts/slice_art.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "static" / "art"
RAW = ROOT / "raw"
KINDS = ["hall", "library", "cafe", "home", "gym", "garden", "studio", "bakery", "florist", "observatory", "postoffice", "toyshop", "cottage"]
BACKDROPS = {"background": 2000, "scene": 1600, "room": 600}  # file-name prefix -> max width
KEY = (255, 0, 255)
# what each sheet in docs/art_prompts.md holds, in reading order; saved as prop_<name>.webp when the count matches
PROPS = {"scenery": ["tree_yellow", "tree_orange", "tree_green", "cloud_1", "cloud_2", "bush", "sun", "moon"],
         "scenery2": ["lamp", "bench", "mailbox", "fence", "bike", "tulips", "cat", "sheep", "balloon"]}


def cut_out(img, thresh=38, erode=5):
    """RGBA with the background transparent (a lower thresh keeps white wool, e.g. clouds)."""
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
            ImageDraw.floodfill(rgb, s, KEY, thresh=thresh)
    mask = np.all(np.array(rgb) == KEY, axis=-1)
    alpha = Image.fromarray(np.where(mask, 0, 255).astype("uint8"))
    alpha = alpha.filter(ImageFilter.MinFilter(erode)).filter(ImageFilter.GaussianBlur(0.8))  # trim the white halo
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


def pieces(img, min_gap=10, depth=0):
    """Split a sheet of separate items: bands of rows, then columns within each band, and again inside
    each piece until nothing splits further (items in staggered grids still come apart)."""
    a = np.array(img.getchannel("A")) > 24
    out = []
    for y0, y1 in runs(a.sum(1) > 2, min_gap):
        band = a[y0:y1]
        for x0, x1 in runs(band.sum(0) > 2, min_gap):
            p = trim(img.crop((x0, y0, x1, y1)))
            if p.width * p.height <= 1500:
                continue
            if depth < 3 and (p.width, p.height) != img.size:
                out += pieces(p, min_gap, depth + 1)
            else:
                out.append(p)
    return out


def frame_box(img):
    """Where the empty picture frame on a room's back wall is, as fractions [x0, y0, x1, y1] (or None)."""
    small = img.convert("RGB").resize((256, 256))
    for seed in ((128, 70), (128, 60), (128, 80)):
        probe = small.copy()
        ImageDraw.floodfill(probe, seed, KEY, thresh=26)
        box = Image.fromarray(np.all(np.array(probe) == KEY, axis=-1).astype("uint8") * 255).getbbox()
        if box and 0.2 < (box[2] - box[0]) / 256 < 0.42 and 0.2 < (box[3] - box[1]) / 256 < 0.6:
            return [round(v / 256, 3) for v in box]
    return None


def save(img, name, width):
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(ROOT / f"{name}.webp", quality=88, method=6)
    print(f"  {name}.webp {img.width}x{img.height}")


def main():
    ROOT.mkdir(exist_ok=True)
    frames = {}
    for f in sorted(RAW.glob("*.png")):  # background*, scene_*, room_* -> plain resized jpgs
        width = BACKDROPS.get(f.stem.split("_")[0])
        if not width:
            continue
        img = Image.open(f).convert("RGB")
        if img.width > width:
            img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
        img.save(ROOT / f"{f.stem}.jpg", quality=86, optimize=True)
        if f.stem.startswith("room"):
            frames[f"{f.stem}.jpg"] = frame_box(img)
        print(f"{f.stem}.jpg {img.width}x{img.height} {frames.get(f.stem + '.jpg') or ''}")
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
    for f in sorted(RAW.glob("scenery*.png")):  # scenery.png -> scenery_0.., scenery2.png -> scenery2_0..
        parts = pieces(cut_out(Image.open(f), *((14, 3) if f.stem == "scenery" else (38, 5))))  # white clouds need the gentle cut
        names = PROPS.get(f.stem, [])
        print(f"{f.stem}: {len(parts)} pieces" + ("" if len(parts) == len(names) else " (unexpected count: numbered instead of named)"))
        for i, p in enumerate(parts):
            save(p, f"prop_{names[i]}" if len(parts) == len(names) else f"{f.stem}_{i}", 360)
    # name -> [width, height] (+ the picture frame box for rooms), so the page can lay things out before they load
    sizes = {f.name: list(Image.open(f).size) + (frames.get(f.name) or []) for f in sorted(ROOT.iterdir()) if f.suffix in (".webp", ".jpg")}
    (ROOT / "manifest.json").write_text(json.dumps(sizes, indent=1))
    print(f"manifest: {len(sizes)} files")


if __name__ == "__main__":
    main()
