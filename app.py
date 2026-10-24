"""Future Feed: check in on a small habit, watch your Instagram from ten years out grow. Run: python app.py"""
import json
import os
import random
import re
import uuid

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import agents
import db
import game

ROOT = os.path.dirname(os.path.abspath(__file__))
app = FastAPI(title="Future Feed")
db.init()
app.mount("/static", StaticFiles(directory=os.path.join(ROOT, "static")), name="static")

HANDLE = re.compile(r"[^a-z0-9._]")


def clean_handle(text, fallback):
    h = HANDLE.sub("", (text or "").lower().replace(" ", "."))[:24]
    return h or fallback


def profile():
    return db.get_setting("profile")


def active_habits():
    with db.connect() as c:
        return [dict(r) for r in c.execute("SELECT * FROM habits WHERE active = 1 ORDER BY id")]


def recent_posts(habit_id, n=6):
    with db.connect() as c:
        rows = c.execute(
            "SELECT timeline, kind, future_date, caption FROM posts WHERE habit_id = ? OR habit_id IS NULL "
            "ORDER BY id DESC LIMIT ?", (habit_id, n * 2)).fetchall()
    return [dict(r) for r in reversed(rows)]


# ---------- the post pipeline: story -> reality check -> photo ----------

def generate_post(habit, kind, life_event="", combo_with=None):
    st = game.stats(habit)
    prof = profile()
    run_id = uuid.uuid4().hex[:12]
    ch = st["allowed_chapter"]
    allowed = st["allowed_milestone"]["milestone"] if allowed_ok(st) else "just getting started; nothing impressive yet"
    nxt = st["next_milestone"]["milestone"] if st["next_milestone"] else "none"

    if kind in ("boss", "comeback"):
        at_risk_chapter = min(ch + 1, len(game.TEMPLATES[habit["key"]]["chapters"]) - 1)
        future = game.future_date_for(st, at_risk_chapter, salt=st["checkins"])
    else:
        future = game.future_date_for(st, max(ch, 0), salt=st["checkins"])

    context = {
        "profile": {"name": prof["name"], "handle": prof["handle"]},
        "cast": prof["cast"],
        "habit": {"label": st["label"], "daily_amount": f"{st['amount']} {st['unit']}"},
        "post_kind": kind,
        "future_date": future,
        "allowed_milestone": allowed,
        "next_milestone_not_reached": nxt,
        "life_event": life_event,
        "combo_with": combo_with or {},
        "recent_posts": recent_posts(habit["id"]),
    }
    try:
        s = agents.story(run_id, context)
        caption = s["caption"]
        check = agents.reality_check(run_id, caption, s["claims"], allowed, nxt)
    except agents.BudgetExceeded as e:
        raise HTTPException(429, str(e))
    if not check["passes"] and check["fixed_caption"].strip():
        db.log_event(run_id, "overclaim_fixed",
                     json.dumps({"before": caption, "after": check["fixed_caption"], "why": check["problem"]}))
        caption = check["fixed_caption"]

    if s["new_character_handle"].strip() and len(prof["cast"]) < 8:
        prof["cast"].append({"name": s["new_character_name"][:30],
                             "handle": clean_handle(s["new_character_handle"], "friend"),
                             "relation": s["new_character_relation"][:40]})
        db.set_setting("profile", prof)

    with db.connect() as c:
        used = [json.loads(r["photo"])["url"] for r in c.execute("SELECT photo FROM posts WHERE photo IS NOT NULL")
                if r["photo"] and r["photo"] != "null"]
    photo = agents.find_photo(s["photo_query"], habit["key"], avoid=used)
    basis = st["allowed_milestone"]["basis"] if allowed_ok(st) else ""
    rng = random.Random(run_id)
    likes = rng.randint(12, 30) + 18 * max(ch, 0) + (40 if kind in ("level_up", "comeback", "combo") else 0)
    combo_tag = f"combo:{combo_with['habit_id']}" if combo_with else ""

    with db.connect() as c:
        cur = c.execute(
            "INSERT INTO posts (habit_id, timeline, kind, level, future_date, caption, location, comments, likes, photo, basis, created_day, run_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (habit["id"], "kept", kind, st["level"], future, caption, s["location"][:60],
             json.dumps(s["comments"][:3], ensure_ascii=False), likes, json.dumps(photo),
             (basis + " " + combo_tag).strip(), game.today().isoformat(), run_id))
        c.execute(
            "INSERT INTO posts (habit_id, timeline, kind, level, future_date, caption, location, comments, likes, photo, basis, created_day, run_id) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (habit["id"], "stopped", kind, st["level"], future, s["stopped_caption"], "",
             json.dumps([{"handle": prof["cast"][0]["handle"], "text": s["stopped_comment"]}] if s["stopped_comment"] else [],
                        ensure_ascii=False),
             max(3, likes // 6), json.dumps(photo), "", game.today().isoformat(), run_id))
        post_id = cur.lastrowid
    return {"post_id": post_id, "kind": kind, "usage": db.run_usage(run_id),
            "fixed": not check["passes"], "problem": check["problem"]}


def allowed_ok(st):
    return st["allowed_milestone"] is not None


def detect_slumps():
    """A habit untouched for BOSS_GAP_DAYS triggers a boss: a worried post and a 3-day comeback quest."""
    for h in active_habits():
        st = game.stats(h)
        if st["checkins"] and st["gap"] is not None and st["gap"] >= game.BOSS_GAP_DAYS and not st["quest"]:
            with db.connect() as c:
                c.execute("INSERT INTO quests (habit_id, started_day) VALUES (?, ?)", (h["id"], game.today().isoformat()))
            generate_post(h, "boss")


# ---------- API ----------

class ProfileIn(BaseModel):
    name: str
    bestie: str = ""


@app.post("/api/profile")
def set_profile(body: ProfileIn):
    name = body.name.strip()[:30]
    if not name:
        raise HTTPException(400, "Tell us your first name.")
    bestie = body.bestie.strip()[:30] or "Maya"
    db.set_setting("profile", {
        "name": name,
        "handle": clean_handle(name, "you") + ".2036",
        "cast": [
            {"name": bestie, "handle": clean_handle(bestie, "bestie"), "relation": "best friend"},
            {"name": "Mom", "handle": "mom", "relation": "mom"},
        ],
    })
    return {"ok": True}


@app.get("/api/state")
def state(plain: bool = False):
    if profile() and not plain:
        detect_slumps()
    return {
        "profile": profile(),
        "today": game.today().isoformat(),
        "day_offset": db.get_setting("day_offset", 0),
        "habits": [game.stats(h) for h in active_habits()],
        "templates": [{k: t[k] for k in ("key", "label", "short", "emoji", "unit", "default_amount")} for t in game.HABITS["habits"]],
        "level_checkins": game.LEVEL_CHECKINS,
    }


class HabitIn(BaseModel):
    key: str
    amount: int


@app.post("/api/habits")
def add_habit(body: HabitIn):
    if body.key not in game.TEMPLATES:
        raise HTTPException(400, "Unknown habit.")
    if not 1 <= body.amount <= 240:
        raise HTTPException(400, "Pick an amount between 1 and 240.")
    if any(h["key"] == body.key for h in active_habits()):
        raise HTTPException(400, "You're already tracking that one.")
    with db.connect() as c:
        c.execute("INSERT INTO habits (key, amount, started_on) VALUES (?,?,?)",
                  (body.key, body.amount, game.today().isoformat()))
    return {"ok": True}


@app.post("/api/habits/{habit_id}/checkin")
def checkin(habit_id: int, plain: bool = False):
    habit = next((h for h in active_habits() if h["id"] == habit_id), None)
    if not habit:
        raise HTTPException(404, "Habit not found.")
    before = game.stats(habit)
    if before["checked_today"]:
        raise HTTPException(400, "Already checked in today. Come back tomorrow.")
    with db.connect() as c:
        c.execute("INSERT INTO checkins (habit_id, day) VALUES (?,?)", (habit_id, game.today().isoformat()))
    after = game.stats(habit)
    if plain:  # control group for the A/B test: a normal habit tracker, no future feed, no AI
        return {"post_id": None, "kind": "plain", "usage": [], "level_before": before["level"], "level_after": after["level"]}

    kind, event, combo = "daily", "", None
    if after["quest"] and after["quest"]["progress"] >= after["quest"]["target"]:
        with db.connect() as c:
            c.execute("UPDATE quests SET status = 'done' WHERE id = ?", (after["quest"]["id"],))
        kind = "comeback"
    elif after["level"] > before["level"]:
        kind = "level_up"
    else:
        partner = next((game.stats(h) for h in active_habits()
                        if h["id"] != habit_id and game.stats(h)["level"] >= 3), None)
        if partner and after["level"] >= 3:
            with db.connect() as c:
                seen = c.execute("SELECT 1 FROM posts WHERE kind = 'combo' AND (basis LIKE ? OR habit_id = ?)",
                                 (f"%combo:{habit_id}%", partner["id"])).fetchone()
            if not seen:
                kind = "combo"
                combo = {"habit_id": partner["id"], "label": partner["label"],
                         "milestone": partner["allowed_milestone"]["milestone"] if partner["allowed_milestone"] else ""}
        if kind == "daily" and random.random() < 0.3:
            kind, event = "life_event", random.choice(game.HABITS["life_events"])
    result = generate_post(habit, kind, life_event=event, combo_with=combo)
    return {**result, "level_before": before["level"], "level_after": after["level"]}


@app.get("/api/feed")
def feed(timeline: str = "kept"):
    if timeline not in ("kept", "stopped"):
        raise HTTPException(400, "timeline must be kept or stopped")
    with db.connect() as c:
        rows = [dict(r) for r in c.execute(
            "SELECT p.*, h.key AS habit_key FROM posts p LEFT JOIN habits h ON h.id = p.habit_id "
            "WHERE timeline = ? ORDER BY p.id DESC LIMIT 100", (timeline,))]
    for r in rows:
        r["comments"] = json.loads(r["comments"] or "[]")
        r["photo"] = json.loads(r["photo"]) if r["photo"] else None
    return rows


@app.get("/api/usage")
def usage():
    with db.connect() as c:
        runs = c.execute(
            "SELECT run_id, GROUP_CONCAT(agent) agents, SUM(input_tokens) i, SUM(cached_tokens) ca, SUM(output_tokens) o, "
            "MIN(created_at) t FROM usage GROUP BY run_id ORDER BY t DESC LIMIT 50").fetchall()
        events = c.execute("SELECT * FROM events ORDER BY id DESC LIMIT 50").fetchall()
    return {"today_tokens": db.tokens_today(), "daily_cap": agents.DAILY_TOKEN_CAP,
            "runs": [dict(r) for r in runs], "events": [dict(e) for e in events]}


# ---------- demo controls: move the app's clock so a week of play fits in a 3-minute demo ----------

class DaysIn(BaseModel):
    days: int = 1
    rate: float = 1.0


@app.post("/api/demo/advance")
def demo_advance(body: DaysIn):
    """Move the clock forward. With rate > 0, auto check in that share of the skipped days (no posts for them)."""
    days = max(1, min(body.days, 60))
    rng = random.Random(42)
    levels = {h["id"]: game.stats(h)["level"] for h in active_habits()}
    for _ in range(days):
        if body.rate > 0:
            for h in active_habits():
                if rng.random() < body.rate:
                    with db.connect() as c:
                        c.execute("INSERT OR IGNORE INTO checkins (habit_id, day) VALUES (?,?)",
                                  (h["id"], game.today().isoformat()))
        db.set_setting("day_offset", db.get_setting("day_offset", 0) + 1)
    for h in active_habits():  # one celebratory post per habit that leveled up while we skipped ahead
        if game.stats(h)["level"] > levels.get(h["id"], 0):
            generate_post(h, "level_up")
    return {"today": game.today().isoformat()}


@app.post("/api/demo/reset")
def demo_reset():
    with db.connect() as c:
        for t in ("settings", "habits", "checkins", "posts", "quests"):
            c.execute(f"DELETE FROM {t}")
    return {"ok": True}


# ---------- A/B study: survey answers live in their own table, untouched by demo reset ----------

SURVEY_COLUMNS = ["participant", "date", "order", "habit",
                  *[f"{v}_{k}" for v in "AB" for k in ("motivation", "predicted_days", "future_self", "enjoy",
                                                         "keep_using", "explore_seconds", "observations")],
                  "preference", "why", "unrealistic_or_uncomfortable", "stopped_timeline_feeling",
                  "stopped_timeline_comment", "current_habit_app", "quote_ok", "followup_did_habit", "notes"]


class SurveyIn(BaseModel):
    participant: str
    part: str            # "version" or "final"
    version: str = ""    # "A" or "B" for part == "version"
    position: int = 0    # 1 = first version tried, 2 = second
    answers: dict


@app.post("/api/survey")
def save_survey(body: SurveyIn):
    pid = re.sub(r"[^A-Za-z0-9_-]", "", body.participant)[:12]
    if not pid or body.part not in ("version", "final") or (body.part == "version" and body.version not in ("A", "B")):
        raise HTTPException(400, "Missing participant, part, or version.")
    with db.connect() as c:
        c.execute("INSERT INTO survey (participant, part, version, position, answers) VALUES (?,?,?,?,?)",
                  (pid, body.part, body.version, body.position, json.dumps(body.answers, ensure_ascii=False)[:5000]))
    return {"ok": True}


def survey_rows():
    """One row per participant; later submissions overwrite earlier ones (so a redo just works)."""
    people = {}
    with db.connect() as c:
        for r in c.execute("SELECT * FROM survey ORDER BY id"):
            p = people.setdefault(r["participant"], {"participant": r["participant"], "date": r["created_at"][:10]})
            a = json.loads(r["answers"])
            if r["part"] == "version":
                if r["position"] == 1:
                    p["order"] = "AB" if r["version"] == "A" else "BA"
                for k, v in a.items():
                    p[k if k in ("habit", "notes") else f"{r['version']}_{k}"] = v
            else:
                p.update(a)
    return [people[k] for k in sorted(people, key=lambda s: (len(s), s))]


@app.get("/api/survey")
def survey_list():
    return survey_rows()


@app.get("/api/survey.csv")
def survey_csv():
    import csv
    import io
    from fastapi.responses import Response
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=SURVEY_COLUMNS, extrasaction="ignore")
    w.writeheader()
    for row in survey_rows():
        w.writerow(row)
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=ab-results.csv"})


@app.get("/research")
def research():
    return FileResponse(os.path.join(ROOT, "static", "research.html"))


@app.get("/")
def index():
    return FileResponse(os.path.join(ROOT, "static", "index.html"))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Future Feed is running at http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
