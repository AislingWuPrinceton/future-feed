# Future Feed

Repo: https://github.com/AislingWuPrinceton/future-feed (public)

**Check in on one small habit a day. Each check-in brings a postcard from your future self and fills a room in your 2036 town.**

Most habit apps only count streaks, so people get bored and quit. Future Feed turns a habit into a story about your future self, set in a needle-felted town. Each habit is a building. Every check-in moves into a room and brings a postcard from you a few years ahead, written by AI but held to your real pace. Fill a floor of rooms (1, 2, 4, 7, 16, 30 check-ins) and the building grows a storey. Skip a few days and a storm rolls in, with a worried postcard and a 3-day comeback quest.

## Run it locally (about 3 minutes)

You need Python 3.10 or newer and an internet connection (the postcard photos load from Creative Commons sites).

1. Clone the repo and enter the folder.
   ```bash
   git clone https://github.com/AislingWuPrinceton/future-feed.git
   cd future-feed
   ```
2. Create a virtual environment and install the dependencies.
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate        # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Provide the API key. The app reads `.env` from this folder first, then from the folder one level up. It needs only `PORTKEY_API_KEY` (course key, model `gpt-6-luna`). See `.env.example`.
4. Start the app.
   ```bash
   python app.py
   ```
5. Open http://localhost:8000. A three-page story explains the idea. Then enter your name, pick a habit, and **press and hold "Hold to check in"**. A short tour shows you around.

No database setup is needed: `data/futurefeed.db` is created on first run. The habit data and a pre-vetted photo library ship in `data/`.

**Try a month in two minutes:** open **Menu → Time travel (demo)**.
- **Next day** moves the app's clock forward one day.
- **Skip 4 days (slump)** triggers the storm: a worried postcard and a 3-day comeback quest.
- **Fast-forward 2 weeks** checks in on about 85% of days and climbs floors.
- **Start over** erases everything.

## What you can do

| Where | What |
|---|---|
| Today | Hold to check in. The postcard arrives in an envelope; tap it to turn it over (handwritten letter, AI-designed vintage stamp, postmark). |
| Latest from 2036 | Your newest postcards. The week's stamps above them step back through past weeks; tap a day to see its postcards. |
| Your 2036 town | One felt building per habit, growing a storey per full floor of rooms. Pick a season, tap the sun for night, shake the trees, make a cloud rain. |
| Inside a building | Floor by floor, each room holds the postcard from the day you earned it. Change the building's style, or decorate any room. |
| Menu | Add a habit (or "Something else": the AI designs its milestones), manage habits (edit, catch up a missed day, remove a building), play your next 10 years as a story, AI usage and safety log, How it works. |

## Agents and tools

| Step | Who | What |
|---|---|---|
| 1 | Game engine (`game.py`, no AI) | Levels, streaks, ten-year projection of your real pace, which milestone is allowed, storm and quest state. |
| 2 | Story agent (`gpt-6-luna`) | Writes the next postcard (caption, comments, letter, stamp design), continuing the story and its cast, and lists the claims it makes. |
| 3 | Reality-check agent (`gpt-6-luna`) | Compares the caption with the allowed milestone and rewrites anything that overclaims. |
| 4 | Photo tool + photo safety agent (`gpt-6-luna`, vision) | Picks a fresh Creative Commons photo for the scene; the safety agent looks at it once (cached by URL) and blocks unsafe images. |
| 5 | Ladder agent (`gpt-6-luna`) | For a custom habit, designs a 6-step milestone ladder in practice hours, or refuses harmful "habits". |

Postcards are pre-written while you look at the app, so most check-ins reveal instantly.

## Safety built in

- **Overclaiming:** the reality-check agent rewrites captions that go beyond your real pace. Every rewrite is in **Menu → AI usage & safety log**.
- **Unsafe photos:** a keyword filter plus the vision safety agent on every photo before it is shown.
- **Unsafe habits and prompt injection:** the Ladder agent refuses harmful custom habits; typed names are treated as data, sanitized and length-capped.
- **Runaway cost:** an output cap on every call, a daily token cap (`FUTUREFEED_DAILY_TOKEN_CAP`, default 300,000) and one check-in per habit per day.
- **Privacy:** an uploaded avatar photo stays on this computer and is never sent to the AI.

## A/B study

`?mode=plain` is the control: an ordinary streak tracker with no postcards, no town and no AI. To run sessions without touching your own town, start a second copy on its own database and open its study console:

```bash
PORT=8002 FUTUREFEED_DB=data/study.db python app.py      # then open http://localhost:8002/research
```

Results from 6 participants: [`docs/ab-results.md`](docs/ab-results.md).

## Data and sources

- Spanish: U.S. State Department FSI (Category I, about 600–750 class hours to professional working proficiency).
- Running: CDC activity guidelines and the NHS Couch to 5K plan. Reading: Brysbaert (2019), 238 words per minute.
- Saving: future value of daily deposits at an assumed 4% return (math, not financial advice). Guitar milestones are labeled estimates.
- Photos: Openverse, Creative Commons, credited on every postcard. Felt art generated for this project; icons drawn with rough.js (MIT, vendored).

## Tests

```bash
pip install -r requirements-dev.txt
python tests/run_safety.py    # overclaim rewrites and name sanitizing (uses the API)
python tests/run_flow.py      # onboarding, level-ups, slump, comeback (resets the local db)
```
