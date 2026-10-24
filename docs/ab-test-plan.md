# Future Feed A/B test plan

**Question:** Does seeing your future self's feed make people more motivated to keep a daily habit than a normal streak tracker?

- **A, control:** `http://localhost:8000/?mode=plain`, a streak tracker with no feed and no AI
- **B, treatment:** `http://localhost:8000/`, the full Future Feed

## Design

- **Within-subjects:** every person tries both versions, so 8–12 people give a usable comparison.
- **Counterbalanced:** odd-numbered participants do A then B, even-numbered do B then A. This cancels out "the second one always feels better."
- **12–15 minutes per person,** in person on your laptop. Remote also works over Zoom: share your screen and give them remote control.
- **Timeline:** run sessions Saturday and Sunday. Send a follow-up text Monday at 9 a.m. Write it up Monday morning.
- **Target:** at least 8 people, 10–12 if you can. Don't count your husband in the results. Use him as the pilot run to time the session.

## Recruiting message

> Hey! For my AI class final project I built an app that's a twist on habit trackers. Would you try it for 15 minutes this weekend? You'll test two versions and answer a short survey. In person or Zoom, and coffee's on me ☕ Reply with a time that works Sat/Sun.

Post it in your SOM section group chat, message 3–4 people directly (direct messages work far better), and ask anyone who says yes to bring a friend. Try for a mix: some MBA classmates, some people outside SOM, and both English and Chinese speakers.

## Before each session

1. In the app, click the clock icon, then **Reset everything**.
2. Open the AI usage panel and note the last run time, so you know which runs belong to this person.
3. Start a screen recording if they agree. It gives you quotes and screenshots for the report.
4. Have a timer ready.

## Session script (same steps in both versions)

Read this aloud: *"There are no right answers. I didn't build this to be praised, so honest criticism helps me most. Pick one habit you actually wish you did more."*

For each version (A or B, in their assigned order):

1. They onboard with their own first name, a real friend's name, and one real habit.
2. They tap **I did it** (day 1).
3. You open Demo controls and click **Next day**. They tap **I did it** (day 2).
4. You click **Skip 4 days**. In B this triggers the slump. In A they see the streak reset. Let them react.
5. They tap **I did it** once more.
6. Say: *"Feel free to keep looking around. Tell me when you're done."* **Time how long they keep exploring on their own.** This is your behavioral measure.
7. They fill in survey Part 1 for this version. Reset the app before the second version.

After both versions, they fill in Part 2.

**Watch for and write down:** first reactions word for word ("oh wow", "that's creepy"), anything they find confusing, whether they scroll the feed, whether they open "You, if you stopped," and how they react to the slump.

## Survey (paste into Google Forms)

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
9. How did it feel to see "You, if you stopped"? (Motivating / Neutral / Discouraging), plus an optional comment
10. What habit app, if any, do you use today? (open; gives you named competitors)
11. Can I quote you anonymously in my report? (Yes / No)

## Monday follow-up text (9 a.m.)

> Quick one: did you do [habit] on Saturday or Sunday after trying the app? (yes/no) And which version do you still remember? Thanks again!

This is a small real-behavior signal. Report it as descriptive only.

## What goes in the report

| Metric | How to report |
|---|---|
| Motivation, predicted days, future-self connection, enjoyment | Average for A, average for B, the average of each person's B − A difference, and how many people scored B higher. Show a simple dot plot with one line per person from A to B. |
| Voluntary exploring time | Median seconds for A vs B |
| Preference | X of N preferred B |
| Would keep using | Count of Yes/Maybe/No for each version |
| Quotes | 2–3 short quotes, positive and critical |
| Unrealistic or uncomfortable | Count, and what triggered it. Pair this with the Reality-check safety log. |
| Follow-up | X of N did the habit over the weekend |

**Limits to state honestly:** a small sample of friends and classmates (they want to be nice), a single session (novelty effect), self-reported intentions rather than weeks of real behavior, and a simulated time skip. Next step: a 2-week field test.
