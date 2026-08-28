# Prototype extraction notes

Source: `MP Proto V1.0 for Claude.xlsm` (sheets: Game simulation, Roll and
Mascots, Betting Tickets, Spell Pool, Game Board, Game simulation player 2;
VBA: Module6 main loop, Module9 game setup, Module2 tutorial/mode, Module10
show/hide).

## Where each mechanic came from

| Mechanic | Source in workbook |
|---|---|
| Mascot roll distributions (10 outcomes each) | Roll and Mascots `AC6:AL9` via `=INDIRECT("R{r}C"&INT(RAND()*10)+29)` |
| Board 0–100, start at 50 | Game simulation `S9:S109`, `GameSimResetGame` |
| Reward collection (exclusive of start step, inclusive of end) | `MouseyRewardCollect` etc.: `> Last` and `<= Current` |
| Ticket catalog (24 tickets) | Betting Tickets `Table797` (S28:AJ51) |
| Ticket placement at mascot step + offset | `=INDIRECT(mascotName)+Target1` (Y21:AB24) + `GameSimPlaceReward*OnBoard` |
| Ticket tier drop weights per EP level | Betting Tickets G8:O31 |
| Shop draws one tier per mascot per round | `GameSimRefreshCardShop`: 4 sequential draws +100/+200/+300/+400 |
| Spell catalog + costs | Game simulation `Table9` (BG10:BK41) |
| Spell drop weights per EP level | Spell Pool G8:O39 |
| Two spell offers, must differ | `RefreshSpell` |
| Spell effects/caps (double +50, halve −50, steal 50, move N) | `SpellDoubleEP`, `SpellHalveEP`, `SpellStealEP`, `SpellMoveEPCloser` |
| Move-closer distances (Mousey 2, Bizarro 6, Wolf 2, Flixy 4) | `BuySpell` RewardMoveSteps |
| Up/down/freeze roll flags (shared between players) | Betting Tickets AD8:AD11 + `PowerRoll`/`PowerReRoll`/`PowerFreeze` |
| Mascot News thresholds + 3-roll duration | `MascotNews`, `MascotNews1`, `MascotNews2` |
| Coins: start 7, +7/round, interest ⌊c/5⌋ max 5 | DO31/DO32 + `GameSimIncrementCoins` |
| Refresh bets costs 2 coins | `GameSimRefreshAndPayCoins` |
| EP levels 1–5 at 0/30/80/200/500 | Game simulation DN11:DO15 |
| 1P: 10 rounds, goal 1000; 2P: first to 1000 | `IsGameOver` |

## Deliberate deviations from the prototype

1. **Opponent-targeting spells (Halve, Steal) are excluded from the 1-player
   shop.** The prototype could offer them but the cast would always be refused
   ("No EP on any Steps"), wasting a shop slot.
2. **Ticket EP placement is clamped to steps 0–100.** In Excel, a target step
   beyond the board silently discarded the reward (the placement loop found no
   matching row).
3. **Mascot steps clamp at 0/100.** The Excel step cells could leave the board
   range; the visible board simply had no rows there.
4. **Original mascot art.** The workbook embedded watermarked stock clipart
   (123RF/Dreamstime), which can't be shipped; `src/mascotArt.js` contains
   original SVG stand-ins.
5. **MascotNews3 (free spell for each player) is not implemented** — it was
   unreachable in the prototype's threshold table (no branch calls it).
6. **Ticket difficulty is computed live, not hand-labeled.** The prototype's
   Difficulty column (Table797 col X) was the designer's judgment and didn't
   always track the odds columns next to it. The game now computes the exact
   payout probability within a 4-roll window (first-passage DP over the die,
   `src/odds.js`) and buckets it into the same Easy→Very Hard vocabulary. The
   original labels remain in `data.js` for reference.

## Unused prototype content

- Spell type x60 (IDs 160/260/360/460) exists in the pool tables with zero
  weight at every level and no VBA handler — not ported.
- The "Synergies"/"Hero stats"/stock-ticker rows (MA, WFC, JNJ, FB…) on Roll
  and Mascots appear to be design scratchpad for future mascots — not ported.
