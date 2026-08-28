# Market Party

Bet on the mascots. Collect the EP. Throw the best party on the Street. 🎲

A browser port of the original Excel prototype (`MP Proto V1.0 for Claude.xlsm`).
Four stock-market mascots random-walk a 0–100 track; players buy betting
tickets that drop EP bounties on board steps, cast spells to tilt the odds,
and bank EP when a mascot lands on or passes their bounties.

## Play

No build step, no dependencies — it's plain HTML/JS. Serve the folder with any
static server and open it:

```bash
python -m http.server 8642
```

Then visit <http://localhost:8642>.

- **1 Player** — 10 rounds; score 1000+ EP to make the leaderboard.
- **2 Players** — hotseat; first to 1000 EP wins.

## How a round works

1. **Bet** — spend Coins on up to 4 Betting Tickets (one offer per mascot,
   refreshed each round; a manual refresh costs 2 Coins). A ticket places its
   EP reward on step(s) offset from the mascot's current position.
2. **Cast** — spend banked EP on up to 2 Spells: double a bounty, drag it
   closer, steal or halve an opponent's bounty, or force a mascot up, down,
   or frozen on the next roll.
3. **Roll** — every mascot draws one of its 10 equally likely moves:
   - **Mousey** (Giant): steady, ±1 to ±4
   - **Bizarro** (Crazy): wild swings, up to ±10, skews positive
   - **Wolf** (Grower): grinds upward, mostly +1
   - **Flixy** (Flyer): fast mover, up to ±8, skews positive
4. Any bounty a mascot lands on or passes is collected by its owner.
5. Coins refill (+7 plus interest: ⌊coins/5⌋, max 5), shops refresh, and
   **Mascot News** may hit — forcing one mascot up-only or down-only for
   3 rolls (40% chance per round when no news is active).

Banked EP raises your **Level** (1–5 at 0/30/80/200/500 EP), which unlocks
rarer, bigger tickets and spells in the shop.

## Repo layout

```
index.html          entry point
style.css           all styling
src/data.js         game data extracted from the Excel prototype
src/engine.js       pure game engine (no DOM) — port of the VBA logic
src/rng.js          seedable RNG
src/ui.js           DOM rendering + input
src/mascotArt.js    original SVG mascot art
test/               engine tests (node --test)
docs/               prototype extraction notes
```

## Test

```bash
npm test
```

Runs the engine test suite (Node's built-in test runner, no dependencies).
