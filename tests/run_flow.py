"""End-to-end game flow against the real model: onboarding, check-ins, level-up, slump boss, comeback."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient
import app

c = TestClient(app.app)


def last(tl="kept"):
    p = c.get(f"/api/feed?timeline={tl}").json()[0]
    return f"[{p['kind']} L{p['level']} {p['future_date']} @{p['location']}] {p['caption']}  | " + \
        " / ".join(f"{x['handle']}: {x['text']}" for x in p["comments"]) + \
        f"  | photo: {(p['photo'] or {}).get('title', 'none')[:40]}"


def step(label, r):
    d = r.json()
    print(f"\n== {label} [{r.status_code}]", {k: d[k] for k in ("kind", "level_after", "fixed", "problem") if k in d})
    if r.status_code == 200 and "usage" in d:
        print("   tokens:", sum(u["input_tokens"] + u["output_tokens"] for u in d["usage"]), [u["agent"] for u in d["usage"]])
        print("   KEPT   :", last("kept"))
        print("   STOPPED:", last("stopped"))


c.post("/api/demo/reset")
c.post("/api/profile", json={"name": "Aisling", "bestie": "Jess"})
c.post("/api/habits", json={"key": "guitar", "amount": 10})
hid = c.get("/api/state").json()["habits"][0]["id"]
step("day 1 check-in", c.post(f"/api/habits/{hid}/checkin"))
step("same day again", c.post(f"/api/habits/{hid}/checkin"))
for day in (2, 3):
    c.post("/api/demo/advance", json={"days": 1, "rate": 0})
    step(f"day {day} check-in", c.post(f"/api/habits/{hid}/checkin"))
c.post("/api/demo/advance", json={"days": 4, "rate": 0})
s = c.get("/api/state").json()["habits"][0]
print("\n== after 4 idle days: quest", s["quest"], "\n   BOSS:", last("kept"))
for day in range(3):
    step(f"comeback day {day + 1}", c.post(f"/api/habits/{hid}/checkin"))
    c.post("/api/demo/advance", json={"days": 1, "rate": 0})
print("\nstate:", json.dumps({k: c.get('/api/state').json()['habits'][0][k] for k in ('level', 'checkins', 'adherence', 'projected_10y', 'allowed_chapter', 'capped_by_pace')}))
print("cast:", c.get("/api/state").json()["profile"]["cast"])
