# Future Feed A/B test plan

**Question:** Does seeing your future self's feed make people more motivated to keep a daily habit than a normal streak tracker?

- **A, control:** a plain streak tracker with no postcards, no town and no AI (`?mode=plain`)
- **B, treatment:** the full Future Feed: a short story, a guided tour, AI postcards from your future self, and a felt town whose buildings grow with your check-ins

Run both from the **study server**, which keeps its own database so resetting it never touches your own town:

```bash
cd future-feed && PORT=8002 FUTUREFEED_DB=data/study.db .venv/bin/python app.py
```

Then open the console at `http://localhost:8002/research`. It opens A and B for you (`/?mode=plain&study=1` and `/?study=1`) and shows a red warning if it's ever running on your personal database.

## Design

- **Within-subjects:** every person tries both versions, so 8–12 people give a usable comparison.
- **Counterbalanced:** odd-numbered participants do A then B, even-numbered do B then A. This cancels out "the second one always feels better."
- **12–15 minutes per person,** in person on your laptop. Remote also works over Zoom: share your screen and give them remote control.
- **Timeline:** run sessions Sunday evening and Monday morning (the deadline is Monday 6 p.m.). Write it up Monday afternoon.
- **Target:** at least 8 people, 10–12 if you can. Don't count your husband in the results. Use him as the pilot run to time the session.

## Recruiting message

> Hey! For my AI class final project I built an app that's a twist on habit trackers. Would you try it for 15 minutes this weekend? You'll test two versions and answer a short survey. In person or Zoom, and coffee's on me ☕ Reply with a time that works Sat/Sun.

Post it in your SOM section group chat, message 3–4 people directly (direct messages work far better), and ask anyone who says yes to bring a friend. Try for a mix: some MBA classmates, some people outside SOM, and both English and Chinese speakers.

## Before each session

1. In the study console, click **Reset app** for the round (it only resets the study database).
2. Optional: open the AI usage panel and note the last run time, so you know which runs belong to this person.
3. Start a screen recording if they agree. It gives you quotes and screenshots for the report.
4. Have a timer ready.

## Session script (same steps in both versions)

Read this aloud: *"There are no right answers. I didn't build this to be praised, so honest criticism helps me most. Pick one habit you actually wish you did more."*

For each version (A or B, in their assigned order):

1. They onboard with their own first name, a real friend's name, and one real habit.
2. In B, the story opens first and a 6-step tour follows sign-up. Let them read or skip; don't explain the app yourself.
3. They press and hold **Hold to check in** (day 1). In B a postcard arrives.
4. You click **Next day →** on the black bar at the bottom. They check in again (day 2).
5. You click **Skip 4 days ⏭**. In B this triggers the slump: a storm and a worried postcard (the page takes about 20 seconds; say "it's writing"). In A they see the streak reset. Let them react.
6. They check in once more.
7. Say: *"Feel free to keep looking around. Tell me when you're done."* **Time how long they keep exploring on their own.** This is your behavioral measure.
8. They fill in survey Part 1 for this version (in the console). Reset the app before the second version.

After both versions, they fill in Part 2.

**Watch for and write down:** first reactions word for word ("oh wow", "that's creepy"), anything they find confusing, whether they read and flip a postcard, whether they go inside a building, whether they play with the town (seasons, sun, trees), and how they react to the slump.

## Survey (built into the study console; nothing to paste)

**Part 1. Ask after EACH version. Mark which version (A or B) and whether it was first or second.**

1. How motivated are you to do this habit tomorrow? (1 = not at all, 7 = extremely)
2. If you used this app, how many days next week do you think you'd do the habit? (0–7)
3. How connected do you feel to the person you'll be in 10 years? (1 = completely different person, 7 = the same person) *[Adapted from the Future Self-Continuity measure, Ersner-Hershfield et al., 2009]*
4. How enjoyable was this? (1–7)
5. Would you keep using this app for two weeks? (Yes / Maybe / No)

**Part 2. Ask once, at the end.**

6. Which version would you rather use? (A / B / No preference)
7. Why? (one or two sentences)
8. Did anything in version B feel unrealistic, fake, or uncomfortable? (open)
9. In version B, what made you most want to come back tomorrow? (The postcard from future me / Watching my building grow / The streak / Nothing really)
10. In version B, how did the "storm" after the 4 skipped days feel? (Motivating / Neutral / Discouraging / Didn't notice it), plus an optional comment
11. What habit app, if any, do you use today? (open; gives you named competitors)
12. Can I quote you anonymously in my report? (Yes / No)

## Optional follow-up text (Monday, if time allows)

> Quick one: did you do [habit] today after trying the app? (yes/no) And which version do you still remember? Thanks again!

A small real-behavior signal, only for people tested Sunday. Report it as descriptive only, or skip it.

## What goes in the report

| Metric | How to report |
|---|---|
| Motivation, predicted days, future-self connection, enjoyment | Average for A, average for B, the average of each person's B − A difference, and how many people scored B higher. Show a simple dot plot with one line per person from A to B. |
| Voluntary exploring time | Median seconds for A vs B |
| Preference | X of N preferred B |
| Would keep using | Count of Yes/Maybe/No for each version |
| Quotes | 2–3 short quotes, positive and critical |
| Unrealistic or uncomfortable | Count, and what triggered it. Pair this with the Reality-check safety log. |
| Follow-up (optional) | X of N did the habit the next day |

**Limits to state honestly:** a small sample of friends and classmates (they want to be nice), a single session (novelty effect), self-reported intentions rather than weeks of real behavior, and a simulated time skip. Next step: a 2-week field test.
