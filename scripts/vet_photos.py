"""Run every photo through the photo safety agent once and drop the unsafe ones.

- data/photos.json (the built-in library): unsafe photos are removed from the file.
- custom habits in the local db: unsafe photos are removed from their pools.
- existing posts: an unsafe photo is replaced by the habit icon.

Verdicts are cached in the photo_checks table, so re-running only checks new photos.
Usage: python scripts/vet_photos.py
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import agents  # noqa: E402
import db  # noqa: E402

db.init()
RUN = "vet-photos"


def verdict(img):
    try:
        return img["url"], agents.check_photo(RUN, img)
    except agents.BudgetExceeded as e:
        print("stopped:", e)
        return img["url"], (True, "unchecked: budget")


def vet(images, workers=6):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(verdict, images))


# 1. built-in library
path = Path(agents.PHOTOS_PATH)
library = json.loads(path.read_text())
everything = [img for imgs in library.values() for img in imgs]
results = vet(everything)
removed = []
for key, imgs in library.items():
    keep = []
    for img in imgs:
        safe, reason = results[img["url"]]
        if safe:
            keep.append(img)
        else:
            removed.append((key, img["title"][:50], reason))
    library[key] = keep
path.write_text(json.dumps(library, ensure_ascii=False, indent=1))
print(f"library: checked {len(everything)}, removed {len(removed)}")
for r in removed:
    print("  -", r)

# 2. custom habits' own pools (read first, check, then write: never hold a write lock while checking)
with db.connect() as c:
    customs = [dict(h) for h in c.execute("SELECT id, custom FROM habits WHERE custom IS NOT NULL")]
for h in customs:
    t = json.loads(h["custom"])
    res = vet(t.get("photos", []))
    before = len(t.get("photos", []))
    t["photos"] = [p for p in t.get("photos", []) if res[p["url"]][0]]
    with db.connect() as c:
        c.execute("UPDATE habits SET custom = ? WHERE id = ?", (json.dumps(t, ensure_ascii=False), h["id"]))
    print(f"custom habit {h['id']} ({t['label']}): {before} -> {len(t['photos'])} photos")

# 3. photos already shown in posts
with db.connect() as c:
    rows = [r for r in c.execute("SELECT id, photo FROM posts WHERE photo IS NOT NULL AND photo != 'null'")]
res = vet([json.loads(r["photo"]) | {"tags": json.loads(r["photo"]).get("tags", [])} for r in rows])
with db.connect() as c:
    for r in rows:
        if not res[json.loads(r["photo"])["url"]][0]:
            c.execute("UPDATE posts SET photo = NULL WHERE id = ?", (r["id"],))
            print("post", r["id"], "photo removed")
print("tokens used:", sum(u["input_tokens"] + u["output_tokens"] for u in db.run_usage(RUN)))
