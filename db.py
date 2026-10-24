import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
DB_PATH = DATA / "futurefeed.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    amount INTEGER NOT NULL,
    started_on TEXT NOT NULL,
    active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    UNIQUE (habit_id, day)
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER,
    timeline TEXT NOT NULL,
    kind TEXT NOT NULL,
    level INTEGER,
    future_date TEXT,
    caption TEXT,
    location TEXT,
    comments TEXT,
    likes INTEGER,
    photo TEXT,
    basis TEXT,
    created_day TEXT,
    run_id TEXT
);
CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    started_day TEXT NOT NULL,
    target INTEGER DEFAULT 3,
    status TEXT DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    agent TEXT,
    input_tokens INTEGER,
    cached_tokens INTEGER,
    output_tokens INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS survey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    participant TEXT NOT NULL,
    part TEXT NOT NULL,
    version TEXT,
    position INTEGER,
    answers TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS photo_checks (
    url TEXT PRIMARY KEY,
    safe INTEGER NOT NULL,
    reason TEXT,
    checked_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    checkins INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE (habit_id, day, checkins)
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    kind TEXT,
    detail TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
"""


def init():
    DATA.mkdir(exist_ok=True)
    with connect() as c:
        c.execute("PRAGMA journal_mode=WAL")  # background threads (pre-writing, photo checks) write concurrently
        c.executescript(SCHEMA)
        cols = {r["name"] for r in c.execute("PRAGMA table_info(habits)")}
        for col, ddl in (("start_level", "INTEGER DEFAULT 0"), ("goal", "TEXT DEFAULT ''"), ("custom", "TEXT")):
            if col not in cols:
                c.execute(f"ALTER TABLE habits ADD COLUMN {col} {ddl}")
        if "chapter" not in {r["name"] for r in c.execute("PRAGMA table_info(posts)")}:
            c.execute("ALTER TABLE posts ADD COLUMN chapter INTEGER")


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)  # wait for other writers instead of failing
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_setting(key, default=None):
    with connect() as c:
        row = c.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def set_setting(key, value):
    with connect() as c:
        c.execute("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                  (key, json.dumps(value, ensure_ascii=False)))


def log_usage(run_id, agent, usage):
    details = getattr(usage, "input_tokens_details", None)
    cached = getattr(details, "cached_tokens", 0) or 0
    with connect() as c:
        c.execute("INSERT INTO usage (run_id, agent, input_tokens, cached_tokens, output_tokens) VALUES (?,?,?,?,?)",
                  (run_id, agent, usage.input_tokens, cached, usage.output_tokens))


def log_event(run_id, kind, detail):
    with connect() as c:
        c.execute("INSERT INTO events (run_id, kind, detail) VALUES (?,?,?)", (run_id, kind, detail))


def tokens_today():
    with connect() as c:
        row = c.execute("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM usage "
                        "WHERE date(created_at) = date('now', 'localtime')").fetchone()
    return row[0]


def run_usage(run_id):
    with connect() as c:
        rows = c.execute("SELECT agent, input_tokens, cached_tokens, output_tokens FROM usage WHERE run_id = ? ORDER BY id",
                         (run_id,)).fetchall()
    return [dict(r) for r in rows]


def photo_verdict(url):
    with connect() as c:
        row = c.execute("SELECT safe, reason FROM photo_checks WHERE url = ?", (url,)).fetchone()
    return (bool(row["safe"]), row["reason"]) if row else None


def save_photo_verdict(url, safe, reason):
    with connect() as c:
        c.execute("INSERT OR REPLACE INTO photo_checks (url, safe, reason) VALUES (?,?,?)", (url, int(safe), reason[:200]))
