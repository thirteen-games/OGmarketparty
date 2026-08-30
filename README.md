# Market Party

Bet on the mascots. Collect the gold. Throw the best party on the Street. 🎲

A browser port of the original Excel prototype (`MP Proto V1.0 for Claude.xlsm`).
Stock-market mascots random-walk a 0–100 track; players buy betting
tickets that drop Gold bounties on board steps, cast spells to tilt the odds,
and bank Gold when a mascot lands on or passes their bounties. The roster holds
five mascots — Mousey, Wolf, Flixy, Bizarro, and Lev the fish — with four
fielded per game (chosen at random in classic modes, drafted in roguelike).

## Play

No build step, no dependencies — it's plain HTML/JS. Serve the folder with any
static server and open it:

```bash
python serve.py 8642
```

(`serve.py` is a stock `http.server` with caching disabled; any static server works.)

Then visit <http://localhost:8642>.

- **1 Player** — 10 rounds; score 1000+ Gold to make the leaderboard.
- **2 Players** — hotseat; first to 1000 Gold wins.
- **vs Bot** — battle 🐣 Rookie Randy, 🐂 Billy Bull, or 🐻 Baldy Bear; the bot
  takes its turn automatically when you hit Roll.
- **Roguelike** — 15 rounds with Gold checkpoints at rounds 3/6/9/12 (40/225/500/1000;
  miss one and the run ends) and a 1500 Gold victory target. Stretch bonuses pay
  +7 Dollars (before interest) for clearing round 3 with 80+ and round 6 with 400+.
  Start with one mascot, two ticket slots, and no spells - draft mascots at
  cleared checkpoints to grow the shop (slots, Super Rare/Epic and Legendary
  drops) and unlock spells.

## How a round works

1. **Bet** — spend Dollars on up to 4 Betting Tickets (one offer per mascot,
   refreshed each round; a manual refresh costs 2 Dollars). A ticket places its
   Gold reward on step(s) offset from the mascot's current position.
2. **Cast** — spend banked Gold on up to 2 Spells: double a bounty, drag it
   closer, steal or halve an opponent's bounty, or force a mascot up, down,
   or frozen on the next roll.
3. **Roll** — every mascot draws one of its 10 equally likely moves:
   - **Mousey** (Giant): steady, ±1 to ±4
   - **Bizarro** (Crazy): wild swings, up to ±10, skews positive
   - **Wolf** (Grower): grinds upward, mostly +1
   - **Flixy** (Flyer): fast mover, up to ±8, skews positive
4. Any bounty a mascot lands on or passes is collected by its owner.
5. Dollars refill (+7 plus interest: ⌊coins/5⌋, max 5), shops refresh, and
   **Mascot News** may hit — forcing one mascot up-only or down-only for
   3 rolls (40% chance per round when no news is active).

Banked Gold raises your **Level** (1–5 at 0/30/80/200/500 Gold), which unlocks
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
