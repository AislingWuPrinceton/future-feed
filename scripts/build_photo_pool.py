"""Fetch a small library of Creative Commons photos from Openverse into data/photos.json.

Run once (Openverse is slow, so the app never calls it live). Every photo keeps its creator,
license, and source page for attribution.
"""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

SCENES = {
    "guitar": ["acoustic guitar", "guitar living room", "guitar friends", "guitar campfire", "guitar stage",
               "open mic", "guitar wedding", "busking guitar", "guitar practice", "band rehearsal"],
    "spanish": ["mexico city street", "barcelona street", "madrid cafe", "spanish market", "tacos",
                "spanish class", "seville", "buenos aires", "language exchange", "spain beach"],
    "running": ["running park", "5k race", "marathon runners", "trail running", "running shoes",
                "morning run", "running track", "half marathon", "running group", "finish line"],
    "reading": ["reading book", "book club", "library", "bookstore", "books coffee",
                "reading park", "bookshelf", "reading window", "used books", "reading train"],
    "saving": ["piggy bank", "travel japan", "beach vacation", "new apartment keys", "road trip",
               "coffee shop laptop", "mountain hiking trip", "airport travel", "home office", "savings jar"],
}
OUT = Path(__file__).resolve().parent.parent / "data" / "photos.json"


def search(q):
    for attempt in range(3):
        try:
            r = httpx.get("https://api.openverse.org/v1/images/",
                          params={"q": q, "page_size": 8, "mature": "false", "category": "photograph"}, timeout=60)
            return r.json().get("results", [])
        except Exception as e:
            print("  retry", q, e)
            time.sleep(3)
    return []


def collect(habit, queries):
    seen, items = set(), []
    for q, results in zip(queries, POOL.map(search, queries)):
        for img in results[:4]:
            if not img.get("url") or img["url"] in seen:
                continue
            seen.add(img["url"])
            items.append({
                "id": img["id"], "scene": q, "title": img.get("title") or "",
                "tags": [t["name"] for t in (img.get("tags") or [])][:12],
                "url": img["url"], "thumb": img.get("thumbnail") or img["url"],
                "creator": img.get("creator") or "unknown",
                "license": f"CC {img.get('license', '').upper()} {img.get('license_version') or ''}".strip(),
                "page": img.get("foreign_landing_url") or "",
            })
    print(habit, len(items), flush=True)
    return items


POOL = ThreadPoolExecutor(max_workers=10)
pool = {habit: collect(habit, queries) for habit, queries in SCENES.items()}
OUT.write_text(json.dumps(pool, ensure_ascii=False, indent=1))
print("wrote", {k: len(v) for k, v in pool.items()})
