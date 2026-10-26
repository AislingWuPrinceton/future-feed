"""Future Feed: check in on a small habit, watch your Instagram from ten years out grow. Run: python app.py"""
import json
import os
import random
import re
import threading
import uuid
from typing import Optional

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


@app.middleware("http")
async def revalidate_static(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response

HANDLE = re.compile(r"[^a-z0-9._]")
NO_CACHE = {"Cache-Control": "no-cache"}  # always revalidate pages so testers never see a stale version


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

def compose_post(habit, kind, st, life_event="", combo_with=None):
    """Story agent -> reality check -> photo safety agent. Returns everything needed to store the post later."""
    prof = profile()
    run_id = uuid.uuid4().hex[:12]
    ch = st["allowed_chapter"]
    allowed = st["allowed_milestone"]["milestone"] if allowed_ok(st) else "just getting started; nothing impressive yet"
    nxt = st["next_milestone"]["milestone"] if st["next_milestone"] else "none"

    if kind in ("boss", "comeback"):
        post_chapter = min(ch + 1, len(game.template_for(habit)["chapters"]) - 1)  # the moment at risk
    else:
        post_chapter = max(ch, 0)
    future = game.future_date_for(st, habit, post_chapter, salt=st["checkins"])

    context = {
        "profile": {"name": prof["name"], "handle": prof["handle"]},
        "cast": prof["cast"],
        "habit": {"label": st["label"], "daily_amount": f"{st['amount']} {st['unit']}",
                  "started_as": START_LEVELS[st["start_level"]], "personal_goal": st["goal"]},
        "post_kind": kind,
        "today": game.today().isoformat(),
        "future_date": future,
        "allowed_milestone": allowed,
        "next_milestone_not_reached": nxt,
        "life_event": life_event,
        "combo_with": combo_with or {},
        "recent_posts": recent_posts(habit["id"]),
    }
    s = agents.story(run_id, context)
    caption = s["caption"]
    check = agents.reality_check(run_id, caption, s["claims"], allowed, nxt)
    if not check["passes"] and check["fixed_caption"].strip():
        db.log_event(run_id, "overclaim_fixed",
                     json.dumps({"before": caption, "after": check["fixed_caption"], "why": check["problem"]}))
        caption = check["fixed_caption"]

    with db.connect() as c:
        used = [json.loads(r["photo"])["url"] for r in c.execute("SELECT photo FROM posts WHERE photo IS NOT NULL")
                if r["photo"] and r["photo"] != "null"]
        for r in c.execute("SELECT payload FROM drafts"):  # postcards written ahead count too
            d = json.loads(r["payload"])
            used += [ph["url"] for ph in (d.get("photo"), d.get("stopped_photo")) if ph]
    custom_pool = refill_photos(habit) if habit.get("custom") else None
    if custom_pool is not None and not [img for img in custom_pool if img["url"] not in used]:
        custom_pool = grow_photos(habit, [s["photo_query"]])  # used them all up: find more for this very scene
    # prefer photos whose title/tags actually mention the habit (avoids odd off-topic stock shots)
    anchor = game.template_for(habit)["short"].lower() if custom_pool else \
        {"guitar": "guitar", "running": "run", "reading": "book", "spanish": None, "saving": None}.get(habit["key"])
    photo = agents.pick_photo(run_id, s["photo_query"], habit["key"], avoid=used, pool=custom_pool, anchor=anchor)
    if not photo:  # empty or fully-blocked pool: an everyday scene still beats a blank card
        photo = agents.pick_photo(run_id, s["photo_query"], "life", avoid=used)
    # The you who stopped lives a different day: an everyday scene without the habit.
    stopped_photo = agents.pick_photo(run_id, s["stopped_photo_query"], "life", avoid=used)
    rng = random.Random(run_id)
    likes = rng.randint(12, 30) + 18 * max(ch, 0) + (40 if kind in ("level_up", "comeback", "combo") else 0)
    basis = st["allowed_milestone"]["basis"] if allowed_ok(st) else ""
    combo_tag = f"combo:{combo_with['habit_id']}" if combo_with else ""
    return {
        "run_id": run_id, "kind": kind, "level": st["level"], "chapter": post_chapter, "future": future,
        "caption": caption, "location": s["location"][:60],
        "letter": s["letter"][:400], "postmark": s["postmark"][:24].upper(), "stamp": clean_stamp(s.get("stamp")), "comments": s["comments"][:3], "likes": likes,
        "photo": photo, "basis": (basis + " " + combo_tag).strip(),
        "stopped_caption": s["stopped_caption"], "stopped_photo": stopped_photo,
        "stopped_comments": [{"handle": prof["cast"][0]["handle"], "text": s["stopped_comment"]}] if s["stopped_comment"] else [],
        "new_character": {"name": s["new_character_name"], "handle": s["new_character_handle"],
                          "relation": s["new_character_relation"]},
        "fixed": not check["passes"], "problem": check["problem"],
    }


def clean_stamp(st):
    """The story agent's stamp design, trimmed; the page draws it."""
    if not isinstance(st, dict) or st.get("motif") not in game.ICONS:
        return ""
    return json.dumps({"motif": st["motif"], "title": str(st.get("title", ""))[:16].upper(), "value": str(st.get("value", ""))[:7],
                       "color": st.get("color") if st.get("color") in ("rose", "sage", "teal", "mustard", "plum", "rust", "navy") else "rose"})


def store_post(habit, d):
    """Save a composed post (and its road-not-taken twin)."""
    prof = profile()
    nc = d["new_character"]
    if nc["handle"].strip() and len(prof["cast"]) < 8 and not any(c["name"] == nc["name"] for c in prof["cast"]):
        prof["cast"].append({"name": nc["name"][:30], "handle": clean_handle(nc["handle"], "friend"),
                             "relation": nc["relation"][:40]})
        db.set_setting("profile", prof)
    cols = "habit_id, timeline, kind, level, chapter, future_date, caption, location, comments, likes, photo, basis, created_day, run_id"
    today = game.today().isoformat()
    with db.connect() as c:
        cur = c.execute(f"INSERT INTO posts ({cols}, letter, postmark, stamp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (habit["id"], "kept", d["kind"], d["level"], d["chapter"], d["future"], d["caption"], d["location"],
                         json.dumps(d["comments"], ensure_ascii=False), d["likes"], json.dumps(d["photo"]), d["basis"], today, d["run_id"],
                         d.get("letter", ""), d.get("postmark", ""), d.get("stamp", "")))
        c.execute(f"INSERT INTO posts ({cols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (habit["id"], "stopped", d["kind"], d["level"], d["chapter"], d["future"], d["stopped_caption"], "",
                   json.dumps(d["stopped_comments"], ensure_ascii=False), max(3, d["likes"] // 6),
                   json.dumps(d["stopped_photo"]), "", today, d["run_id"]))
        post_id = cur.lastrowid
    return {"post_id": post_id, "kind": d["kind"], "usage": db.run_usage(d["run_id"]),
            "fixed": d["fixed"], "problem": d["problem"]}


def generate_post(habit, kind, life_event="", combo_with=None):
    try:
        return store_post(habit, compose_post(habit, kind, game.stats(habit), life_event, combo_with))
    except agents.BudgetExceeded as e:
        raise HTTPException(429, str(e))


# ---------- pre-writing: tomorrow's postcard is composed while you look at today's road ----------

PREGEN = {}                 # (habit_id, day, checkins) -> threading.Event while a draft is being written
PREGEN_LOCK = threading.Lock()


def plan_checkin(habit, before, after):
    """What kind of post the next check-in produces. Deterministic per habit and day, so a draft
    written in advance and the real check-in agree."""
    if after["quest"] and after["quest"]["progress"] >= after["quest"]["target"]:
        return "comeback", "", None
    if after["level"] > before["level"]:
        return "level_up", "", None
    partner = next((game.stats(h) for h in active_habits()
                    if h["id"] != habit["id"] and game.stats(h)["level"] >= 3), None)
    if partner and after["level"] >= 3:
        with db.connect() as c:
            seen = c.execute("SELECT 1 FROM posts WHERE kind = 'combo' AND (basis LIKE ? OR habit_id = ?)",
                             (f"%combo:{habit['id']}%", partner["id"])).fetchone()
        if not seen:
            return "combo", "", {"habit_id": partner["id"], "label": partner["label"],
                                 "milestone": partner["allowed_milestone"]["milestone"] if partner["allowed_milestone"] else ""}
    rng = random.Random(f"{habit['id']}-{game.today().isoformat()}")
    if rng.random() < 0.3:
        return "life_event", rng.choice(game.HABITS["life_events"]), None
    return "daily", "", None


def pregen(habit):
    before = game.stats(habit)
    if before["checked_today"]:
        return
    key = (habit["id"], game.today().isoformat(), before["checkins"])
    with PREGEN_LOCK:
        if key in PREGEN:
            return
        with db.connect() as c:
            if c.execute("SELECT 1 FROM drafts WHERE habit_id=? AND day=? AND checkins=?", key).fetchone():
                return
        PREGEN[key] = threading.Event()
    try:
        after = game.stats(habit, assume_checkin=True)
        kind, event, combo = plan_checkin(habit, before, after)
        d = compose_post(habit, kind, after, event, combo)
        with db.connect() as c:
            c.execute("INSERT OR REPLACE INTO drafts (habit_id, day, checkins, kind, payload) VALUES (?,?,?,?,?)",
                      (*key, kind, json.dumps(d, ensure_ascii=False)))
    except Exception as e:  # a failed draft just means the check-in writes it live
        db.log_event("", "pregen_failed", f"{habit['id']}: {type(e).__name__}")
    finally:
        PREGEN.pop(key).set()


def start_pregen():
    for h in active_habits():
        threading.Thread(target=pregen, args=(h,), daemon=True).start()


def take_draft(habit, checkins, kind):
    key = (habit["id"], game.today().isoformat(), checkins)
    ev = PREGEN.get(key)
    if ev:
        ev.wait(timeout=25)  # already being written: wait for it instead of paying twice
    with db.connect() as c:
        row = c.execute("SELECT * FROM drafts WHERE habit_id=? AND day=? AND checkins=?", key).fetchone()
        c.execute("DELETE FROM drafts WHERE habit_id=?", (habit["id"],))
    return json.loads(row["payload"]) if row and row["kind"] == kind else None


def allowed_ok(st):
    return st["allowed_milestone"] is not None


def detect_slumps():
    """A habit untouched for BOSS_GAP_DAYS triggers a boss: a worried post and a 3-day comeback quest."""
    for h in active_habits():
        st = game.stats(h)
        if st["checkins"] and st["gap"] is not None and st["gap"] >= game.BOSS_GAP_DAYS and not st["quest"]:
            with db.connect() as c:
                c.execute("INSERT INTO quests (habit_id, started_day) VALUES (?, ?)", (h["id"], game.today().isoformat()))
            try:
                generate_post(h, "boss")
            except Exception as e:  # never let a failed slump post stop the app from loading
                db.log_event("", "boss_post_failed", f"habit {h['id']}: {e}"[:300])


# ---------- API ----------

class ProfileIn(BaseModel):
    name: str
    bestie: str = ""


@app.post("/api/profile")
def set_profile(body: ProfileIn):
    name = body.name.strip()[:30]
    if not name:
        raise HTTPException(400, "Tell us your first name.")
    supporter = body.bestie.strip()[:30] or "Maya"
    family = supporter.lower() in {"mom", "mum", "mother", "mama", "dad", "father", "papa"}
    db.set_setting("profile", {
        "name": name,
        "handle": clean_handle(name, "you") + ".2036",
        "cast": [
            # the person the user most wants cheering them on: the main recurring character
            {"name": supporter, "handle": clean_handle(supporter, "cheerleader"),
             "relation": "the person they most want cheering them on"},
            {"name": "Sam", "handle": "sam", "relation": "friend"} if family
            else {"name": "Mom", "handle": "mom", "relation": "mom"},
        ],
    })
    return {"ok": True}


AVATAR_CHARACTERS = ["🦊", "🐼", "🐱", "🐰", "🐻", "🐨", "🐸", "🦁", "🐧", "🙂"]
PHOTO_URL = re.compile(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$")


class AvatarIn(BaseModel):
    character: str = ""
    photo: str = ""   # small data URL made in the browser; stays on this machine, never sent to the AI


@app.post("/api/avatar")
def set_avatar(body: AvatarIn):
    prof = profile()
    if not prof:
        raise HTTPException(400, "Create your profile first.")
    if body.photo:
        if not PHOTO_URL.match(body.photo) or len(body.photo) > 400_000:
            raise HTTPException(400, "Use a JPEG or PNG under about 300 KB.")
        prof["avatar"] = {"photo": body.photo}
    elif body.character in AVATAR_CHARACTERS:
        prof["avatar"] = {"character": body.character}
    else:
        raise HTTPException(400, "Pick one of the characters.")
    db.set_setting("profile", prof)
    return {"ok": True}


def with_chapter_dates(h):
    """Stats plus the date you'd reach each chapter at your current pace (the road's year markers)."""
    st = game.stats(h)
    st["chapter_dates"] = [game.future_date_for(st, h, i) for i in range(len(game.template_for(h)["chapters"]))]
    st["chapters"] = [c["milestone"] for c in game.template_for(h)["chapters"]]
    return st


@app.get("/api/state")
def state(plain: bool = False):
    if profile() and not plain:
        detect_slumps()
        start_pregen()
    return {
        "profile": profile(),
        "today": game.today().isoformat(),
        "day_offset": db.get_setting("day_offset", 0),
        "habits": [with_chapter_dates(h) for h in active_habits()],
        "templates": [{k: t[k] for k in ("key", "label", "short", "emoji", "unit", "default_amount")} for t in game.HABITS["habits"]],
        "level_checkins": game.LEVEL_CHECKINS,
        "avatar_characters": AVATAR_CHARACTERS,
    }


START_LEVELS = ["brand new to it", "has tried it a little", "already comfortable with the basics", "already pretty good"]


class HabitIn(BaseModel):
    key: str
    amount: int
    start_level: int = 0
    goal: str = ""
    name: str = ""   # only for key == "custom"
    icon: str = ""   # custom only: picked by the user; empty lets the Ladder agent choose
    look: str = ""   # building style picked by the user (an art name like "bakery"); empty lets the town choose


ART_NAME = re.compile(r"^[a-z0-9_]{1,30}$")


def make_custom(body):
    """Ladder agent designs milestones for a habit we have no data for, or refuses an unsafe one."""
    name = body.name.strip()[:40]
    if not name:
        raise HTTPException(400, "Name your daily thing.")
    run_id = uuid.uuid4().hex[:12]
    try:
        lad = agents.build_ladder(run_id, name, body.amount)
    except agents.BudgetExceeded as e:
        raise HTTPException(429, str(e))
    if not lad["allowed"]:
        db.log_event(run_id, "habit_refused", json.dumps({"habit": name, "why": lad["refusal"]}))
        raise HTTPException(400, lad["refusal"] or "That one isn't something Future Feed can help with.")
    chapters, last = [], 0
    for ch in lad["chapters"][:6]:  # keep only a sane, strictly increasing ladder
        needs = float(ch["needs"])
        if needs > last and needs <= 20000:
            chapters.append({"needs": round(needs, 1), "milestone": ch["milestone"][:160],
                             "basis": ("AI estimate: " + ch["basis"])[:120]})
            last = needs
    if len(chapters) < 3:
        db.log_event(run_id, "ladder_rejected", json.dumps(lad["chapters"])[:500])
        raise HTTPException(502, "Couldn't build a sensible plan for that one. Try wording it differently.")
    template = {"key": "custom", "label": lad["label"][:40] or name, "short": (lad["short"] or name)[:14],
                "icon": body.icon if body.icon in game.ICONS and body.icon != "custom"
                        else lad["icon"] if lad["icon"] in game.ICONS else "custom",
                "emoji": lad["emoji"][:4] or "✨", "unit": "minutes", "measure": "hours",
                "chapters": chapters, "sources": ["Milestones designed by the Ladder agent (estimates)."],
                "photo_queries": lad["photo_queries"][:6],
                "photos": [p for p in agents.fetch_photos(lad["photo_queries"]) if agents.keyword_ok(p)]}
    return template


def grow_photos(habit, queries):
    """A custom habit that has used every photo it has looks up more (for the scene being written now) and keeps them."""
    t = game.template_for(habit)
    have = {img["url"] for img in t.get("photos") or []}
    q = queries[0]
    tries = list(dict.fromkeys([q, " ".join(q.split()[:2]), t["short"]]))  # specific phrases often find nothing; shorter ones do
    page = 1 + len(have) // 16  # a later page each time, so it doesn't bring back the same batch
    new = [p for p in agents.fetch_photos(tries, per_query=8, page=page) if agents.keyword_ok(p) and p["url"] not in have]
    if new:
        t["photos"] = (t.get("photos") or []) + new[:12]
        with db.connect() as c:
            c.execute("UPDATE habits SET custom = ? WHERE id = ?", (json.dumps(t, ensure_ascii=False), habit["id"]))
    return t.get("photos") or []


def refill_photos(habit):
    """A custom habit whose photo search came back empty (Openverse timeout) tries again, once per post."""
    t = game.template_for(habit)
    if len(t.get("photos") or []) >= 3:
        return t["photos"]
    queries = t.get("photo_queries") or [t["label"], t["short"] + " hobby", t["short"] + " practice"]
    found = [p for p in agents.fetch_photos(queries) if agents.keyword_ok(p)]
    if found:
        t["photos"] = found
        with db.connect() as c:
            c.execute("UPDATE habits SET custom = ? WHERE id = ?", (json.dumps(t, ensure_ascii=False), habit["id"]))
    return t.get("photos") or []


@app.post("/api/habits")
def add_habit(body: HabitIn):
    if body.key == "custom":
        if not 1 <= body.amount <= 240 or not 0 <= body.start_level < len(START_LEVELS):
            raise HTTPException(400, "Pick an amount between 1 and 240.")
        template = make_custom(body)
        with db.connect() as c:
            c.execute("INSERT INTO habits (key, amount, started_on, start_level, goal, custom, look) VALUES (?,?,?,?,?,?,?)",
                      ("custom-" + uuid.uuid4().hex[:6], body.amount, game.today().isoformat(), body.start_level,
                       body.goal.strip()[:100], json.dumps(template, ensure_ascii=False), clean_art(body.look)))
        return {"ok": True, "label": template["label"]}
    if body.key not in game.TEMPLATES:
        raise HTTPException(400, "Unknown habit.")
    if not 1 <= body.amount <= 240:
        raise HTTPException(400, "Pick an amount between 1 and 240.")
    if any(h["key"] == body.key for h in active_habits()):
        raise HTTPException(400, "You're already tracking that one.")
    if not 0 <= body.start_level < len(START_LEVELS):
        raise HTTPException(400, "Unknown starting level.")
    with db.connect() as c:
        c.execute("INSERT INTO habits (key, amount, started_on, start_level, goal, look) VALUES (?,?,?,?,?,?)",
                  (body.key, body.amount, game.today().isoformat(), body.start_level, body.goal.strip()[:100], clean_art(body.look)))
    return {"ok": True}


def clean_art(name):
    """A style is just the name of a picture set in static/art; anything else means 'let the town choose'."""
    name = (name or "").strip()
    return name if ART_NAME.match(name) else ""


class StyleIn(BaseModel):
    name: str = ""


@app.post("/api/habits/{habit_id}/look")
def set_look(habit_id: int, body: StyleIn):
    """Restyle a building (empty = back to the town's pick)."""
    with db.connect() as c:
        if not c.execute("UPDATE habits SET look = ? WHERE id = ? AND active = 1", (clean_art(body.name), habit_id)).rowcount:
            raise HTTPException(404, "No such building.")
    return {"ok": True}


@app.post("/api/posts/{post_id}/room")
def set_room(post_id: int, body: StyleIn):
    """Redecorate one room (empty = the building's usual room)."""
    with db.connect() as c:
        if not c.execute("UPDATE posts SET room = ? WHERE id = ?", (clean_art(body.name), post_id)).rowcount:
            raise HTTPException(404, "No such room.")
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

    kind, event, combo = plan_checkin(habit, before, after)
    if kind == "comeback":
        with db.connect() as c:
            c.execute("UPDATE quests SET status = 'done' WHERE id = ?", (after["quest"]["id"],))
    draft = take_draft(habit, before["checkins"], kind)
    if draft:
        result = store_post(habit, draft)
        result["prewritten"] = True
    else:
        result = generate_post(habit, kind, life_event=event, combo_with=combo)
        result["prewritten"] = False
    return {**result, "level_before": before["level"], "level_after": after["level"]}


# ---------- manage your habits: edit, remove a building, undo a check-in, catch up a missed day ----------

BACKFILL_DAYS = 7  # how far back a missed check-in can be added


def habit_or_404(habit_id):
    habit = next((h for h in active_habits() if h["id"] == habit_id), None)
    if not habit:
        raise HTTPException(404, "Habit not found.")
    return habit


class HabitEdit(BaseModel):
    amount: Optional[int] = None
    goal: Optional[str] = None


@app.patch("/api/habits/{habit_id}")
def edit_habit(habit_id: int, body: HabitEdit):
    habit_or_404(habit_id)
    with db.connect() as c:
        if body.amount is not None:
            if not 1 <= body.amount <= 240:
                raise HTTPException(400, "Pick an amount between 1 and 240.")
            c.execute("UPDATE habits SET amount = ? WHERE id = ?", (body.amount, habit_id))
        if body.goal is not None:
            c.execute("UPDATE habits SET goal = ? WHERE id = ?", (body.goal.strip()[:100], habit_id))
    return {"ok": True}


@app.delete("/api/habits/{habit_id}")
def remove_habit(habit_id: int):
    """Take a building down for good: the habit, its check-ins, its postcards and anything waiting for it."""
    habit_or_404(habit_id)
    with db.connect() as c:
        for table in ("checkins", "posts", "quests", "drafts"):
            c.execute(f"DELETE FROM {table} WHERE habit_id = ?", (habit_id,))
        c.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
    return {"ok": True}


@app.delete("/api/habits/{habit_id}/checkins/{day}")
def undo_checkin(habit_id: int, day: str):
    """Take back one day's check-in (a mistake): its room empties and that day's postcards go with it."""
    habit_or_404(habit_id)
    with db.connect() as c:
        if not c.execute("DELETE FROM checkins WHERE habit_id = ? AND day = ?", (habit_id, day)).rowcount:
            raise HTTPException(404, "No check-in that day.")
        c.execute("DELETE FROM posts WHERE habit_id = ? AND created_day = ?", (habit_id, day))
        c.execute("DELETE FROM drafts WHERE habit_id = ?", (habit_id,))  # pre-written postcards counted on the old total
    return {"ok": True}


class MissedIn(BaseModel):
    day: str


@app.post("/api/habits/{habit_id}/missed")
def missed_checkin(habit_id: int, body: MissedIn, plain: bool = False):
    """Catch up a day you did it but forgot to check in (up to a week back). It gets its room and a postcard."""
    from datetime import date, timedelta
    habit = habit_or_404(habit_id)
    try:
        day = date.fromisoformat(body.day)
    except ValueError:
        raise HTTPException(400, "That isn't a date.")
    today = game.today()
    if not (today - timedelta(days=BACKFILL_DAYS) <= day < today):
        raise HTTPException(400, f"You can catch up any of the last {BACKFILL_DAYS} days, not today or the future.")
    if day < date.fromisoformat(habit["started_on"]):
        raise HTTPException(400, "That's before you started this one.")
    before = game.stats(habit)
    with db.connect() as c:
        if c.execute("SELECT 1 FROM checkins WHERE habit_id = ? AND day = ?", (habit_id, day.isoformat())).fetchone():
            raise HTTPException(400, "You already checked in that day.")
        c.execute("INSERT INTO checkins (habit_id, day) VALUES (?,?)", (habit_id, day.isoformat()))
        c.execute("DELETE FROM drafts WHERE habit_id = ?", (habit_id,))
    after = game.stats(habit)
    if plain:
        return {"post_id": None, "kind": "plain", "usage": [], "level_before": before["level"], "level_after": after["level"]}
    result = generate_post(habit, "level_up" if after["level"] > before["level"] else "daily")
    with db.connect() as c:  # the postcard belongs to the day you caught up
        c.execute("UPDATE posts SET created_day = ? WHERE run_id = (SELECT run_id FROM posts WHERE id = ?)", (day.isoformat(), result["post_id"]))
    return {**result, "level_before": before["level"], "level_after": after["level"]}


@app.get("/api/feed")
def feed(timeline: str = "kept"):
    if timeline not in ("kept", "stopped"):
        raise HTTPException(400, "timeline must be kept or stopped")
    with db.connect() as c:
        rows = [dict(r) for r in c.execute(
            "SELECT p.*, h.key AS habit_key FROM posts p LEFT JOIN habits h ON h.id = p.habit_id "
            "WHERE timeline = ? ORDER BY p.id DESC LIMIT 100", (timeline,))]
    # Postcards move with your pace: each post's date is recomputed from today's real adherence.
    habits = {h["id"]: (h, game.stats(h)) for h in active_habits()}
    for r in rows:
        r["comments"] = json.loads(r["comments"] or "[]")
        r["photo"] = json.loads(r["photo"]) if r["photo"] else None
        r["stamp"] = json.loads(r["stamp"]) if r.get("stamp") else None
        r["live_date"] = r["future_date"]
        if r["chapter"] is not None and r["habit_id"] in habits:
            h, st = habits[r["habit_id"]]
            r["live_date"] = game.future_date_for(st, h, r["chapter"], salt=r["id"])
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
        for t in ("settings", "habits", "checkins", "posts", "quests", "drafts"):
            c.execute(f"DELETE FROM {t}")
    return {"ok": True}


# ---------- A/B study: survey answers live in their own table, untouched by demo reset ----------

SURVEY_COLUMNS = ["participant", "date", "order", "habit",
                  *[f"{v}_{k}" for v in "AB" for k in ("motivation", "predicted_days", "future_self", "enjoy",
                                                         "keep_using", "explore_seconds", "observations")],
                  "preference", "why", "unrealistic_or_uncomfortable", "pull", "slump_feeling", "slump_comment",
                  "current_habit_app", "quote_ok", "followup_did_habit", "notes"]


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


@app.get("/api/study-info")
def study_info():
    """Which database this server uses, so the study console can warn before a reset wipes someone's real town."""
    return {"db": db.DB_PATH.name, "personal": db.DB_PATH.name == "futurefeed.db"}


@app.get("/research")
def research():
    return FileResponse(os.path.join(ROOT, "static", "research.html"), headers=NO_CACHE)


@app.get("/")
def index():
    return FileResponse(os.path.join(ROOT, "static", "index.html"), headers=NO_CACHE)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    print(f"Future Feed is running at http://localhost:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port)
