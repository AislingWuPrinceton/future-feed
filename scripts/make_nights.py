"""Make a moonlit night version of each season's town backdrop (static/art/background_<season>_night.jpg).

A night picture you generate yourself wins: put background_<season>_night.png in static/art/raw/ and run
scripts/slice_art.py instead. (The older background_night.jpg has snowy peaks, so it is only a fallback.)
Run: .venv/bin/python scripts/make_nights.py
"""
from pathlib import Path

import json

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / "static" / "art"
RAW = ROOT / "raw"
SEASONS = {"spring": "background_spring", "summer": "background", "autumn": "background_autumn", "winter": "background_winter"}
NAVY = np.array([22, 30, 62], float)


def night(img, seed):
    a = np.asarray(img.convert("RGB"), float) / 255
    h, w, _ = a.shape
    lum = a @ [.3, .59, .11]
    # moonlight: drop the color, darken, push everything toward blue
    grey = a * .62 + lum[..., None] * .38
    moon = grey ** 1.2 * [.56, .68, .98]
    # the sky (top of the picture, bright and pale) sinks into a deep navy
    rows = np.linspace(0, 1, h)[:, None]
    sky = np.clip((lum - .55) / .3, 0, 1) * np.clip((.42 - rows) / .2, 0, 1)
    sky = np.asarray(Image.fromarray((sky * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(w / 160)), float) / 255
    top = NAVY / 255 * (.75 + .5 * rows[..., None])  # (h, 1, 3)
    out = moon * (1 - sky[..., None] * .85) + top * sky[..., None] * .85
    # a soft cool vignette, lighter near the path where the buildings stand
    y = (rows - .78) / .5
    x = np.linspace(-1, 1, w)[None, :]
    out *= np.clip(1.08 - .35 * (x ** 2) - .5 * y ** 2, .55, 1.1)[..., None]
    # tiny cream felt stars where the sky is
    rng = np.random.default_rng(seed)
    for _ in range(int(w * .07)):
        sx, sy = rng.integers(0, w), rng.integers(0, int(h * .35))
        if sky[sy, sx] > .6:
            r = rng.choice([1, 1, 2, 2, 3]) * w / 1500
            yy, xx = np.ogrid[-6:7, -6:7]
            d = np.exp(-(xx ** 2 + yy ** 2) / (2 * r * r))[..., None] * [1, .93, .75] * rng.uniform(.6, 1)
            y0, x0 = max(0, sy - 6), max(0, sx - 6)
            patch = out[y0:sy + 7, x0:sx + 7]
            d = d[y0 - (sy - 6):, x0 - (sx - 6):][:patch.shape[0], :patch.shape[1]]
            patch[:] = np.maximum(patch, d)
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype("uint8"))


def main():
    for i, (s, day) in enumerate(SEASONS.items()):
        name = f"background_{s}_night"
        if (RAW / f"{name}.png").exists():
            print(f"{name}: your own picture is in raw/, skipped (run slice_art.py)")
            continue
        src = ROOT / f"{day}.jpg"
        if not src.exists():
            continue
        out = night(Image.open(src), i)
        out.save(ROOT / f"{name}.jpg", quality=86, optimize=True)
        sizes = json.loads((ROOT / "manifest.json").read_text())  # so the page knows the picture exists
        sizes[f"{name}.jpg"] = list(out.size)
        (ROOT / "manifest.json").write_text(json.dumps(dict(sorted(sizes.items())), indent=1))
        print(f"{name}.jpg")


if __name__ == "__main__":
    main()
