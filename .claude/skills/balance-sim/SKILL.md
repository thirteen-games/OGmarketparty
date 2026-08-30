---
name: balance-sim
description: >-
  Market Party's game-balance pipeline: parity-price betting tickets from real
  odds, analyze dual-target bands (payout + double-hit chances), and calibrate
  roguelike gates/bonuses by simulating four player archetypes. Use this
  whenever the user wants to add or tune a mascot, price or "clean up"
  tickets, change payout ratios, adjust rewards or target bands, set or test
  roguelike checkpoint/bonus values, ask "is X balanced/fair/too easy", or
  see odds/score charts for any proposed rule change — even if they don't say
  "simulate". Numbers must come from these scripts, never from guessing.
---

# Market Party balance pipeline

Every balance decision in this repo is made by computing real odds and
simulating real play, then showing the user a chart and getting agreement
BEFORE editing `src/data.js`. That order matters: the user tunes by feel
against honest numbers, and several current values are deliberate deviations
(see below) that a blind "fix to parity" pass would destroy.

All scripts run from the repo root with plain `node` (no dependencies — they
import the game's own engine, so they can never drift from real rules).

## Core model (why the numbers mean what they mean)

- **Shop window**: ticket odds are always quoted as P(payout within 4 rolls),
  matching the in-game difficulty labels (`oddsHorizon()`).
- **Parity pricing**: a ticket's fair reward is
  `B × cost × ratio(cost) / P(payout)`, where `B = 8.3` EP-per-coin (the
  prototype's tier-1 value) and `ratio` is `PAYOUT_RATIOS` in data.js
  (1.0 / 1.1 / 1.2 / 1.35 / 1.7 / 2.1). The ratio column IS the design: higher
  tiers intentionally pay more per coin, gated by drop rarity.
- **Double-hit odds**: for two-target tickets, "both@5" = P(both chips
  collected within 5 rolls). Reward floor and double odds are coupled through
  the EV budget — big doubles require likely bands, which forces the parity
  reward down. You cannot maximize both; that tradeoff is the user's call.
- **Archetypes**: gate calibration simulates four coin strategies
  (max-spend, 5s-saver, half-spend, spend-then-save-after-round-5), each with
  alert-aware EV shopping, alert-first fishing (while an alert is live they
  spend bounded refreshes hunting an alerted-mascot offer before settling —
  the standing model per playtesting), dead-ticket avoidance, bad-shop
  refreshes, and EV-sound spell casting (direction spells cast only when the
  forced roll's expected collection beats a natural roll's by more than the
  cost). The spend-then-save archetype is also gate-aware: with an unmet
  checkpoint at most two rounds out it reverts to max spending. The
  locked-in config (round-based rarity unlocks SR R4 / Epic R7 / Legendary
  R10; gates 50/300/600/1000/1500, single +7 bonus at R3/80+) sims at
  44/47/47/62% win rates — a deliberately hard ladder where gate-aware
  spend-then-save is the clear winningest strategy and rigid styles lose
  more than they win. 400-run rates carry ±3 points of noise; use
  paired-seed A/B runs before attributing small shifts to a change.
  Real humans score below these idealized players.

## Tools

### Price tickets against the ratio curve
```bash
node .claude/skills/balance-sim/scripts/price_tickets.mjs [--mascot Lev] [--ratios "10=2.2"] [--baseline 8.3]
```
Prints current vs parity reward per ticket plus the realized EP/coin curve by
tier. Use for: pricing a new mascot's tickets, checking curve drift after any
change to dice/targets/ratios. Dry-run only by design — apply agreed numbers
by editing `src/data.js`.

### Analyze or search target bands
```bash
node .claude/skills/balance-sim/scripts/band_analysis.mjs --bands "Mousey:+3/-3,Wolf:+4/-1" [--cost 10] [--ratio 2.1]
node .claude/skills/balance-sim/scripts/band_analysis.mjs --search Wolf --min-reward 200 --by both
```
Reports either@4, both@5, and the parity reward for bands; `--search` scans
all up/down combinations (`--by both` maximizes double odds, `--by tight`
maximizes payout odds). Use for legendary redesigns and any dual-target work.

### Calibrate roguelike gates and bonuses
```bash
node .claude/skills/balance-sim/scripts/rogue_sim.mjs [--runs 400] [--gates 40,225,500,1000,1500] [--bonus3 80] [--bonus6 400]
node .claude/skills/balance-sim/scripts/rogue_sim.mjs --no-gates   # score percentile distributions instead
```
Prints the survival/win/bonus chart the user expects (gates as rows,
archetypes as columns). `--no-gates` gives raw score percentiles at rounds
3/6/9/12/15 — use it to pick fresh targets from the distribution, then
validate with gates on. 400 runs ≈ a couple of minutes; ±3% noise on rates.

## Workflow for any balance change

1. Simulate the proposal with the scripts (override flags — don't edit data
   to experiment; flags mutate in-process only).
2. Show the user the chart in the conversation and get explicit agreement.
   Present tradeoffs (e.g. reward floor vs double odds) as their decision.
3. Apply agreed values to `src/data.js` — it is the single source of truth
   (`TICKETS`, `PAYOUT_RATIOS`, `ROGUE.targets`, `ROGUE.bonuses`, mascot
   `rolls`). UI labels, live odds, bots, and Stats Geek all derive from it.
4. If `PAYOUT_RATIOS` changed, remember it also feeds the Stats Geek popup
   display — one edit covers both.
5. `npm test` (the suite reads data dynamically, but pinned expectations
   occasionally need updating), then re-run `price_tickets.mjs` to confirm
   the curve landed.
6. After economy-level changes (dice, starting coins, slots, rarity gates),
   re-run `rogue_sim.mjs` — gate targets calibrated for the old economy will
   silently drift.
7. Commit with the measured numbers in the message, push.

## Known intentional deviations from parity

None at present. In the 2026-08-30 board redesign the user removed all
special-cased rewards (including Mousey's old 200-vs-185 legendary and the
200 legendary floor) — every ticket now sits at exact curve parity, and
`price_tickets.mjs` should show all-zero diffs.

If a parity chart shows diffs, ask before "fixing" — it may be a newer
deliberate choice; check git log on `src/data.js` first.

## Adding a mascot (pipeline order)

1. Add to `MASCOTS` in data.js (id, die, color, class, `epMoveSteps` scaled
   to avg |move|), plus `SPELL_COSTS` for its 7 spell ids (price Up/Down by
   how much they distort its die) and `NEWS_TABLE` rows (benched-mascot
   suppression self-balances total alert rate).
2. Pick thematic targets per tier, then run `price_tickets.mjs --mascot X`
   to price rewards; user tweaks; add the 6 `TICKETS` rows.
3. Add SVG art in `src/mascotArt.js` (original art only — never the
   workbook's stock clipart).
4. `npm test` (roster-size tests will flag anything missed), quick
   `rogue_sim.mjs` sanity run, then verify visually in the preview.
