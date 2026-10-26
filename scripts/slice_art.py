"""Turn the generated felt pictures in static/art/raw/ into the pieces the town uses (static/art/).

- background*.png, scene_*.png, room_*.png -> resized backdrops (same name, .jpg)
- any other <name>.png (hall, library, bakery, ...) is a building -> <name>_roof / <name>_floor / <name>_ground cut-outs;
  it shows up in the building style picker by itself
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


# rooms painted without a picture frame: where on the bare wall to hang one (inner box, as fractions; clear of the windows)
DRAWN_FRAME = {"room": (.44, .13, .76, .45), "room_apricot": (.2, .13, .52, .45), "room_blue": (.42, .13, .74, .45),
               "room_blush": (.24, .13, .58, .45), "room_sage": (.42, .13, .74, .45)}


def felt_frame(width):
    """The needle-felted frame from the music room, cut off its red wall: (RGBA crop, its inner box in crop pixels)."""
    src = Image.open(RAW / "room_hall.png").convert("RGB")
    src = src.resize((width, round(src.height * width / src.width)), Image.LANCZOS)
    inner = frame_box(src)
    W, H = src.size
    m = round(.07 * W)
    x0, y0, x1, y1 = round(inner[0] * W), round(inner[1] * H), round(inner[2] * W), round(inner[3] * H)
    crop = src.crop((x0 - m, y0 - m, x1 + m, y1 + m))
    a = np.asarray(crop, float)
    wall = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)]), axis=0)
    keep = Image.fromarray((np.linalg.norm(a - wall, axis=-1) > 60).astype("uint8") * 255)
    # the wall is whatever the edges reach; everything inside (frame and mat) stays
    probe = keep.convert("RGB")
    for seed in ((0, 0), (crop.width - 1, 0), (0, crop.height - 1), (crop.width - 1, crop.height - 1)):
        if probe.getpixel(seed) == (0, 0, 0):
            ImageDraw.floodfill(probe, seed, (255, 0, 0))
    wallmask = np.all(np.asarray(probe) == (255, 0, 0), axis=-1)
    # keep only the frame itself (the piece joined to the middle), not bits of guitar or hooks near the corners
    solid = Image.fromarray(np.where(wallmask, 0, 255).astype("uint8")).filter(ImageFilter.MinFilter(3)).convert("RGB")
    ImageDraw.floodfill(solid, (crop.width // 2, crop.height // 2), (0, 255, 0))
    frame_only = np.all(np.asarray(solid) == (0, 255, 0), axis=-1)
    alpha = Image.fromarray(frame_only.astype("uint8") * 255).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1))
    crop.putalpha(alpha)
    return crop, (m, m, m + x1 - x0, m + y1 - y0)


def hang_frame(img, box, frame):
    """Hang the felt frame on a room's wall so its inner opening lands on box, with a soft shadow below it."""
    piece, (ix0, iy0, ix1, iy1) = frame
    W, H = img.size
    tx0, ty0, tx1, ty1 = box[0] * W, box[1] * H, box[2] * W, box[3] * H
    sx, sy = (tx1 - tx0) / (ix1 - ix0), (ty1 - ty0) / (iy1 - iy0)
    piece = piece.resize((round(piece.width * sx), round(piece.height * sy)), Image.LANCZOS)
    at = (round(tx0 - ix0 * sx), round(ty0 - iy0 * sy))
    shadow = Image.new("RGBA", piece.size, (60, 40, 20, 0))
    shadow.putalpha(piece.getchannel("A").point(lambda v: v * .45).filter(ImageFilter.GaussianBlur(W / 90)))
    out = img.convert("RGBA")
    out.alpha_composite(shadow, (at[0] + round(W / 150), at[1] + round(W / 70)))
    out.alpha_composite(piece, at)
    return out.convert("RGB")


def felt_swatch():
    """A patch of real felt (the bare cream wall of the plain room), made neutral grey so the 3D walk can tint it
    any colour and still look like wool: tex_felt.jpg."""
    f = RAW / "room.png"
    if not f.exists():
        return
    img = Image.open(f).convert("L")
    W, H = img.size
    patch = img.crop((int(.38 * W), int(.13 * H), int(.84 * W), int(.47 * H))).resize((512, 512), Image.LANCZOS)
    a = np.asarray(patch, float)
    a = (a - a.mean()) * 2.2 + 222  # keep the fibres, centre it near white so tinting gives the true colour
    Image.fromarray(np.clip(a, 0, 255).astype("uint8")).save(ROOT / "tex_felt.jpg", quality=90)
    print("tex_felt.jpg")


def save(img, name, width):
    if img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(ROOT / f"{name}.webp", quality=88, method=6)
    print(f"  {name}.webp {img.width}x{img.height}")


def main():
    ROOT.mkdir(exist_ok=True)
    frames, frame = {}, None
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
            if not frames[f"{f.stem}.jpg"] and f.stem in DRAWN_FRAME and (RAW / "room_hall.png").exists():
                frame = frame or felt_frame(width)
                img = hang_frame(img, DRAWN_FRAME[f.stem], frame)
                img.save(ROOT / f"{f.stem}.jpg", quality=86, optimize=True)
                frames[f"{f.stem}.jpg"] = [round(v, 3) for v in DRAWN_FRAME[f.stem]]
        print(f"{f.stem}.jpg {img.width}x{img.height} {frames.get(f.stem + '.jpg') or ''}")
    # every other picture in raw/ is a building: roof, upper floor and ground floor, top to bottom
    others = sorted(f.stem for f in RAW.glob("*.png") if not f.stem.startswith(("background", "scene", "room", "scenery")))
    for kind in dict.fromkeys(KINDS + others):
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
    felt_swatch()
    # name -> [width, height] (+ the picture frame box for rooms), so the page can lay things out before they load
    sizes = {f.name: list(Image.open(f).size) + (frames.get(f.name) or []) for f in sorted(ROOT.iterdir()) if f.suffix in (".webp", ".jpg")}
    (ROOT / "manifest.json").write_text(json.dumps(sizes, indent=1))
    print(f"manifest: {len(sizes)} files")


if __name__ == "__main__":
    main()
