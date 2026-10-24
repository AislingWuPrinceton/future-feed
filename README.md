# Future Feed

Repo: https://github.com/AislingWuPrinceton/future-feed

**Check in on one small habit a day. Each check-in sends you a postcard from your future self and moves you one step down the road to 2036.**

Most habit apps only record streaks, so people get bored and quit. Future Feed turns a habit into an unfolding story about your future self, drawn as a hand-drawn notebook: a road from today to 2036 with six stops (one per chapter). Each stop shows the year you'd reach it at your real pace, postcards from your future are pinned above their stop and move closer as you keep going, and the road not taken (the you who stopped) runs below. You check in by pressing and holding, then watch the postcard arrive. Check-ins unlock new chapters, your real pace decides how far those chapters can reach, slumps trigger a "boss," and a second feed shows the you who stopped.

## Run it locally (about 3 minutes)

You need Python 3.10 or newer and an internet connection to load the photos.

1. Clone the repo and enter the folder.
   ```bash
   git clone https://github.com/AislingWuPrinceton/future-feed.git
   cd future-feed
   ```
2. Create a virtual environment and install dependencies.
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate        # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Provide the API key. The app reads `.env` from this folder first, then from the folder one level up. It needs `PORTKEY_API_KEY`. See `.env.example`.
4. Start the app.
   ```bash
   python app.py
   ```
5. Open http://localhost:8000, enter your name, pick a habit, and tap **I did it**.

**Try a month in two minutes:** open **Menu → Time travel (demo)**:
- **Next day** checks in again tomorrow.
- **Skip 4 days** triggers a slump boss and a 3-day comeback quest.
- **Fast-forward 2 weeks** checks in on about 85% of days and jumps levels.
- **Reset everything** starts over.

**Study console:** http://localhost:8000/research walks you through each A/B session, stores survey answers (they survive Reset), and exports `ab-results.csv`.

**A/B test mode:** http://localhost:8000/?mode=plain is the control group. It's an ordinary streak tracker with no feed and no AI. Give testers either version on their own device or a fresh copy, then compare check-in rates and motivation.

## How it plays

| Mechanic | Rule |
|---|---|
| Levels | Unlocked at 1, 3, 7, 14, 30, and 60 check-ins. Each level opens a new chapter, like "plays for friends" or "first open mic." |
| Starting point and dream | Onboarding asks where you're starting (brand new → already pretty good) and your dream in a few words. Experienced people start further along the ladder, and the story steers toward your dream. |
| Pace cap | Your real check-in rate is projected over ten years. A chapter your pace can't reach in ten years stays locked even if your level allows it. Post dates show *when* you'd get there at this pace. |
| Daily posts | Every check-in writes a new post. The story remembers earlier posts and recurring friends. About 30% of days bring a random life event (a "plot twist"). |
| Boss | Three or more days without a check-in brings a worried post from future you. Check in three days in a row to save the moment. |
| Combo | Two habits at Level 3 or higher collide in one surprise post. |
| Instant postcards | Opening the app pre-writes the postcard your next check-in will produce (same day, same check-in count, same event, chosen deterministically), so the reveal is instant. A draft that doesn't match is discarded and the postcard is written live. |
| Postcards are real cards | New postcards arrive in an envelope that opens; tap a card to turn it over. The back holds a short handwritten letter from future-you, a stamp, and a postmark. |
| Two timelines | Each post has a twin from the you who stopped: same date, an everyday-life photo, wistful caption. |
| Future-self avatar | Pick a character or upload a photo (kept on this computer, never sent to the AI). It evolves with your level: ring, habit badge at Lv3, gold at Lv4, crown at Lv5, animated rainbow at Lv6. |
| Play your next 10 years | Plays your kept-going posts in date order as full-screen stories, a video-style recap. |
| Journey map | A hand-drawn trail with 6 stops (one per chapter). Your photo or character is the game piece and hops forward on every check-in. A slump puts a storm over the next stop until the comeback quest is done. |

## Agents and tools

| Step | Who | What |
|---|---|---|
| 1 | Game engine (Python, `game.py`) | Levels, streaks, ten-year projection, which milestone is allowed, boss and quest state. No AI. |
| 2 | Story agent (`gpt-6-luna`) | Writes the next post and its "stopped" twin, continuing the story and cast. Returns a photo query and the claims it makes. |
| 3 | Reality-check agent (`gpt-6-luna`) | Compares the post with the allowed milestone and rewrites anything that overclaims. |
| 4 | Photo tool | Picks the best-matching Creative Commons photo from a local Openverse library (`data/photos.json`) and credits it. The stopped timeline gets an everyday-life photo instead. |
| 4b | Photo safety agent (`gpt-6-luna`, vision) | Looks at each candidate photo once (cached by URL) and rejects nudity, underwear or hosiery, suggestive framing, body close-ups, violence, and horror. A keyword filter runs first. Rejections are logged. `scripts/vet_photos.py` pre-vets the whole library (19 of 230 removed). |
| 5 | Ladder agent (`gpt-6-luna`) | For a custom habit ("Something else"), designs a 6-step milestone ladder in practice hours, or refuses unsafe "habits" (e.g. checking an ex's profile, extreme calorie restriction). Its photos are fetched from Openverse once. |

## Data and sources (`data/habits.json`)

- Spanish: U.S. State Department FSI. Spanish is Category I, about 30 weeks or 600–750 class hours to professional working proficiency. https://www.state.gov/foreign-language-training/
- Running: CDC, 150 minutes a week of moderate activity (https://www.cdc.gov/physical-activity-basics/guidelines/adults.html), and the NHS Couch to 5K plan.
- Reading: Brysbaert (2019), an average silent reading speed of 238 words per minute. Books are assumed to be 80,000 words.
- Saving: future value of daily deposits at an assumed 4% annual return. This is math, not financial advice.
- Guitar milestones have no authoritative hours source, so they are conservative estimates and labeled that way in the app.
- Icons: Future Feed's own hand-drawn set (`static/icons.js`), rendered with rough.js (MIT, vendored in `static/vendor/`).
- Photos: Openverse (https://openverse.org), Creative Commons licensed and credited on every post. Rebuild the library with `python scripts/build_photo_pool.py`.

## Safety built in

- **Overclaiming:** the reality-check agent rewrites captions that exceed your real pace. Every rewrite, with before and after text, is shown in the **Safety log** (chart icon).
- **Unsafe photos:** keyword filter plus the photo safety agent (vision) on every photo before it's shown.
- **Unsafe habits:** the Ladder agent refuses harmful custom habits, and refusals are logged in the Safety log.
- **Prompt injection:** names you type are treated as data. Handles are sanitized and lengths are capped.
- **Runaway cost:** each call has an output cap and a daily token cap (`FUTUREFEED_DAILY_TOKEN_CAP`), with one check-in per habit per day.
- **Tone:** the stopped timeline is wistful, never shaming.

## Tests

```bash
pip install -r requirements-dev.txt
python tests/run_flow.py      # onboarding, level-ups, slump boss, comeback (resets the local db)
```
