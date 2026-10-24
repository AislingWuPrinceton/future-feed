"""Pre-writing check: after the app loads, tomorrow's postcard is drafted in the background,
so the next check-in returns almost instantly. Uses a throwaway database."""
import sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import db
db.DB_PATH = Path(tempfile.mkdtemp()) / "test.db"
from fastapi.testclient import TestClient
import app

c = TestClient(app.app)
c.post("/api/profile", json={"name": "Taylor", "bestie": "Sam"})
c.post("/api/habits", json={"key": "guitar", "amount": 10})
hid = c.get("/api/state").json()["habits"][0]["id"]

t = time.time(); r = c.post(f"/api/habits/{hid}/checkin").json()
print(f"day 1 (no draft yet): {time.time() - t:.1f}s  kind={r['kind']} prewritten={r['prewritten']}")

c.post("/api/demo/advance", json={"days": 1, "rate": 0})
c.get("/api/state")  # opening the app starts the background draft
for _ in range(60):
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM drafts").fetchone():
            break
    time.sleep(0.5)
t = time.time(); r = c.post(f"/api/habits/{hid}/checkin").json()
print(f"day 2 (draft ready):  {time.time() - t:.1f}s  kind={r['kind']} prewritten={r['prewritten']}")
print("caption:", c.get("/api/feed").json()[0]["caption"][:120])
