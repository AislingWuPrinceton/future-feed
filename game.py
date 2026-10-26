"""Game rules: levels, streaks, projections, boss quests. Pure Python, no AI.

Two forces shape the future you see:
- Check-ins unlock levels (new chapters of the story).
- Your real adherence decides how far those chapters can reach in ten years.
"""
import json
from datetime import date, timedelta
from pathlib import Path

import db

HABITS = json.loads((Path(__file__).resolve().parent / "data" / "habits.json").read_text())
TEMPLATES = {h["key"]: h for h in HABITS["habits"]}
LEVEL_CHECKINS = HABITS["level_checkins"]
BOSS_GAP_DAYS = 3
YEARS = 10


def today():
    return date.today() + timedelta(days=db.get_setting("day_offset", 0))


def value_at(template, amount, adherence, years):
    """How much of the measure you'd have after `years` at this pace."""
    days = 365 * years * adherence
    m = template["measure"]
    if m == "hours":
        return amount / 60 * days
    if m == "books":
        return amount * template["words_per_minute"] * days / template["words_per_book"]
    if m == "dollars":
        r = template["annual_return"]
        yearly = amount * 365 * adherence
        if r == 0:
            return yearly * years
        return yearly * ((1 + r) ** years - 1) / r
    raise ValueError(m)


def template_for(habit):
    """Built-in habits come from data/habits.json; custom ones carry an AI-built ladder in the db."""
    if habit.get("custom"):
        return json.loads(habit["custom"])
    return TEMPLATES[habit["key"]]


ICONS = ["guitar", "spanish", "chat", "running", "reading", "saving", "dance", "music", "lotus", "palette", "pencil",
         "dumbbell", "piano", "pan", "sprout", "laptop", "bike", "wave", "drop", "moon", "heart", "sun", "camera",
         "apple", "coffee", "headphones", "globe", "mountain", "ball", "paw", "broom", "bed", "mic", "puzzle", "plane",
         "tree", "flame", "house", "pill", "phone", "clock", "flower", "custom"]
ICON_WORDS = [("dance", "danc ballet salsa tango hip-hop"), ("piano", "piano keyboard"),
              ("music", "sing song violin drum ukulele cello flute music"), ("lotus", "meditat yoga breath mindful stretch"),
              ("palette", "paint draw sketch art watercolor"), ("pencil", "writ journal diary poem blog novel"),
              ("dumbbell", "gym lift workout push-up pushup strength exercise squat"), ("pan", "cook bake meal recipe"),
              ("sprout", "garden plant"), ("laptop", "code coding program python leetcode"), ("bike", "bike cycl"),
              ("wave", "swim surf"), ("drop", "water hydrat drink"), ("moon", "sleep bed"), ("heart", "gratitude kind love family call"),
              ("sun", "wake morning sunrise early"), ("camera", "photo camera"), ("reading", "read book"),
              ("running", "run jog walk step hike"), ("saving", "save money budget invest"),
              ("chat", "english french chinese japanese korean german italian language speak vocab duolingo")]


def icon_for(template, habit_key):
    """Built-ins use their own icon; custom habits use the one the Ladder agent picked, or a keyword guess."""
    if template.get("icon") in ICONS:
        return template["icon"]
    if habit_key in TEMPLATES:
        return habit_key
    label = template.get("label", "").lower()
    return next((icon for icon, words in ICON_WORDS if any(w in label for w in words.split())), "custom")


def baseline(template, start_level):
    """What you already have before day 1: the threshold of the last chapter you've already reached."""
    return template["chapters"][start_level - 1]["needs"] if start_level else 0


def years_to(template, amount, adherence, needs):
    if adherence <= 0:
        return None
    t = 0.05
    while t <= YEARS + 1e-9:
        if value_at(template, amount, adherence, t) >= needs:
            return round(t, 2)
        t += 0.05
    return None


def stats(habit, assume_checkin=False):
    """Everything the UI and the agents need to know about one habit, today.

    assume_checkin=True answers "what if they check in today?", used to pre-write tomorrow's postcard."""
    t = template_for(habit)
    start = habit.get("start_level") or 0
    now = today()
    with db.connect() as c:
        days = [date.fromisoformat(r["day"]) for r in
                c.execute("SELECT day FROM checkins WHERE habit_id = ? ORDER BY day", (habit["id"],))]
        quest = c.execute("SELECT * FROM quests WHERE habit_id = ? AND status = 'active'", (habit["id"],)).fetchone()
    if assume_checkin and now not in days:
        days.append(now)
    checked = set(days)
    started = date.fromisoformat(habit["started_on"])
    span = max(1, (now - started).days + 1)
    adherence = min(1.0, len(days) / span)

    streak, d = 0, now if now in checked else now - timedelta(days=1)
    while d in checked:
        streak += 1
        d -= timedelta(days=1)

    level = sum(1 for n in LEVEL_CHECKINS if len(days) >= n)
    next_at = next((n for n in LEVEL_CHECKINS if len(days) < n), None)
    projected = baseline(t, start) + value_at(t, habit["amount"], adherence, YEARS)
    chapters = t["chapters"]
    reachable = max([i for i, ch in enumerate(chapters) if ch["needs"] <= projected], default=-1)
    # story can't run ahead of check-ins OR of real pace; experienced people start further along
    allowed = min(start + level - 1, reachable)
    gap = (now - days[-1]).days if days else None

    quest_progress = 0
    if quest:
        # current streak, counting only days since the slump was detected
        quest_progress = min(streak, (now - date.fromisoformat(quest["started_day"])).days + 1)
    return {
        "id": habit["id"], "key": habit["key"], "label": t["label"], "short": t["short"], "emoji": t["emoji"],
        "icon": icon_for(t, habit["key"]),
        "look": habit.get("look") or "",
        "started_on": habit["started_on"],
        "amount": habit["amount"], "unit": t["unit"], "measure": t["measure"],
        "checkins": len(days), "days": [d.isoformat() for d in sorted(days)], "checked_today": now in checked, "streak": streak, "gap": gap,
        "adherence": round(adherence, 3), "level": level, "next_level_at": next_at,
        "projected_10y": round(projected, 1),
        "allowed_chapter": allowed,
        "allowed_milestone": chapters[allowed] if allowed >= 0 else None,
        "next_milestone": chapters[allowed + 1] if allowed + 1 < len(chapters) else None,
        "capped_by_pace": start + level - 1 > reachable,
        "start_level": start, "goal": habit.get("goal") or "", "custom": bool(habit.get("custom")),
        "quest": dict(quest) | {"progress": quest_progress} if quest else None,
    }


def future_date_for(st, habit, chapter_index, salt=0):
    """When, at the current pace, you'd actually reach this chapter."""
    t = template_for(habit)
    needs = t["chapters"][max(chapter_index, 0)]["needs"] - baseline(t, habit.get("start_level") or 0)
    yrs = years_to(t, st["amount"], max(st["adherence"], 0.05), max(needs, 0)) or YEARS
    yrs = max(yrs, 0.25)
    d = today() + timedelta(days=int(yrs * 365) + (salt * 17) % 40)
    return d.isoformat()
