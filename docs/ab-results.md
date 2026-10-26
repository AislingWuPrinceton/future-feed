# Future Feed A/B test: results

**Run:** Oct 25–26, 2026 · 6 real participants (friends and classmates), in person, one session each
**Versions:** A = plain streak tracker (`?mode=plain`), B = Future Feed (story + tour, AI postcards from your future self, a felt town that grows)
**Design:** within-subjects and counterbalanced. P1 and P3 did A first; P2, P4 and P6 did B first; P5 has no recorded order.
**Data:** [`ab-results.csv`](ab-results.csv) · chart: [`ab-results-chart.html`](ab-results-chart.html)

## Data quality, stated plainly

- **4 complete pairs** (P1, P3, P4, P6) answered the 1–7 questions for both versions: 2 did A first, 2 did B first. All A-vs-B comparisons below use these 4.
- **P2 and P5 only have version B answers saved** (the A round wasn't saved). They count for preference, the B-only questions, and quotes.
- Exploring time was recorded for 3 people in A and 4 in B.

## Headline

**Everyone who tried both versions scored Future Feed higher on every question, and all 6 participants preferred it.**

| Measure (1–7, or 0–7 days) | A average | B average | Average B − A | Scored B higher |
|---|---|---|---|---|
| Motivation to do the habit tomorrow | 2.3 | 6.3 | +4.0 | 4 of 4 |
| Days they'd do it next week | 1.8 | 6.3 | +4.5 | 4 of 4 |
| Feeling connected to their future self | 2.0 | 6.0 | +4.0 | 4 of 4 |
| Enjoyment | 2.3 | 6.5 | +4.3 | 4 of 4 |

The smallest individual gain on any question was +3 points. Across all 6 B sessions, B averaged 6.5 (motivation), 6.3 (days), 6.3 (future self) and 6.3 (enjoyment).

| Other result | A | B |
|---|---|---|
| Preferred this version | 0 of 6 | **6 of 6** |
| Would keep using it for two weeks | 0 Yes · 2 Maybe · 2 No (n=4) | **5 Yes · 1 Maybe** (n=6) |
| Median time exploring on their own | 167 s (n=3) | 229 s (n=4) |

On exploring time: 2 of the 3 people timed in both versions explored longer in B (167 → 393 s, 49 → 131 s); one explored A slightly longer (251 vs 217 s).

## What pulled people back (B only, n=6)

- **The postcard from future me:** 3
- **Watching my building grow:** 2
- **Nothing really:** 1, although this person still rated B 7/7 and preferred it

## The slump ("storm" after 4 skipped days), n=6

Motivating 1 · Neutral 1 · Discouraging 2 · Didn't notice it 2. The slump moment is the weakest part: it rarely motivates, and a third of people missed it. Next step: make the comeback quest more visible and frame it as a rescue rather than a scolding.

## Quotes (all 6 agreed to be quoted anonymously)

- "I can enjoy the process of building my own town & see the future me." (P2)
- "It's more fun with more features, and I can see the future me. Got motivated." (P3)
- "It's more fun, I like to build my own building and collect my things." (P6)
- Version A, as noted by the moderator: "felt nothing to do." (P4)

## Problems people raised

- **"Same postcard picture, it's fake"** (P2). Real bug: custom habits had a small photo pool and reused the same photo. **Fixed Oct 26:** unused photos are chosen first, then the least-used ones, and custom habits fetch more photos when they run out.
- **"Too cute for a man"** (P1). The felt style isn't for everyone; a calmer theme is a possible option.
- Everyone else reported nothing unrealistic or uncomfortable ("nah", "no", "It's perfect").

## Who they are

5 of 6 use no habit app today; 1 uses Notion. Habits tested: running ×2, drawing, basketball, dancing, writing.

## Limits

- Very small sample: 4 complete pairs, 6 people.
- Friends and classmates, who tend to be kind.
- One session each, so novelty probably helps B.
- Self-reported intentions, not weeks of real behavior.
- A simulated time skip.
- Two people's A answers are missing.

Read this as a strong, consistent early signal. The next step is a 2-week field test with real daily check-ins.
