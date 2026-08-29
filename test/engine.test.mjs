import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLAG } from '../src/engine.js';
import { collectProbability, oddsLabel } from '../src/odds.js';
import { BOT_LEVELS, botTakeTurn } from '../src/bot.js';
import {
  MASCOTS, TICKETS, SPELLS, CONFIG, ROGUE, START_STEP, NEWS_TABLE,
  epLevelFor, ticketById, spellById, SPELL_TYPES,
} from '../src/data.js';

test('new game starts with prototype defaults', () => {
  const g = new Game({ mode: 2, seed: 1 });
  for (const m of MASCOTS) assert.equal(g.steps[m.id], START_STEP);
  for (const p of g.players) {
    assert.equal(p.coins, CONFIG.startingCoins);
    assert.equal(p.ep, 0);
    assert.equal(p.tickets.length, 4);
    assert.equal(p.spells.length, 2);
    assert.notEqual(p.spells[0], p.spells[1]);
  }
  // one ticket offer per mascot, in mascot order
  p1offers: for (let i = 0; i < 4; i++) {
    assert.equal(Math.floor(g.players[0].tickets[i] / 100), MASCOTS[i].id);
  }
});

test('EP level thresholds match the workbook', () => {
  assert.equal(epLevelFor(0), 1);
  assert.equal(epLevelFor(29), 1);
  assert.equal(epLevelFor(30), 2);
  assert.equal(epLevelFor(80), 3);
  assert.equal(epLevelFor(200), 4);
  assert.equal(epLevelFor(499), 4);
  assert.equal(epLevelFor(500), 5);
});

test('every mascot has exactly 10 equally likely rolls', () => {
  for (const m of MASCOTS) assert.equal(m.rolls.length, 10);
});

test('ticket data is complete: 4 mascots x 6 tiers', () => {
  assert.equal(TICKETS.length, 24);
  for (const t of TICKETS) {
    assert.ok(t.cost > 0 && t.reward > 0);
    assert.equal(Math.floor(t.id / 100), t.mascotId);
  }
});

test('buying a ticket places EP at mascot step + offsets and charges coins', () => {
  const g = new Game({ mode: 1, seed: 42 });
  const p = g.players[0];
  p.tickets[0] = 105; // Mousey epic: +4 and -4, cost 5, reward 95
  const res = g.buyTicket(0, 0);
  assert.ok(res.ok);
  assert.equal(p.coins, CONFIG.startingCoins - 5);
  assert.equal(p.board[1][54], 95);
  assert.equal(p.board[1][46], 95);
  // one purchase per slot per round
  const again = g.buyTicket(0, 0);
  assert.equal(again.ok, false);
});

test('cannot buy a ticket without enough coins', () => {
  const g = new Game({ mode: 1, seed: 7 });
  g.players[0].coins = 0;
  g.players[0].tickets[0] = 101;
  assert.equal(g.buyTicket(0, 0).ok, false);
});

test('mascot collects EP it passes over, exclusive of start, inclusive of end', () => {
  const g = new Game({ mode: 1, seed: 3 });
  const p = g.players[0];
  p.board[1] = { 50: 10, 51: 20, 53: 30, 54: 40 };
  // force Mousey to roll +3: stub the rng draw
  g.rollForMascot = (m) => (m.id === 1 ? 3 : 0);
  const events = g.roll();
  // start step 50 not collected; 51..53 collected; 54 beyond
  assert.equal(p.board[1][50], 10);
  assert.equal(p.board[1][54], 40);
  assert.equal(p.ep, 50);
  const collects = events.filter((e) => e.type === 'collect');
  assert.deepEqual(collects.map((e) => e.step).sort(), [51, 53]);
});

test('downward moves collect too', () => {
  const g = new Game({ mode: 1, seed: 3 });
  const p = g.players[0];
  p.board[2] = { 44: 25, 50: 5 };
  g.rollForMascot = (m) => (m.id === 2 ? -6 : 0);
  g.roll();
  assert.equal(p.ep, 25);
  assert.equal(p.board[2][50], 5);
});

test('frozen mascot does not move or collect', () => {
  const g = new Game({ mode: 1, seed: 9 });
  g.flags[3] = FLAG.FREEZE;
  g.updateNews = () => {}; // keep random news from re-arming flags after the roll
  g.roll();
  assert.equal(g.steps[3], START_STEP);
  assert.equal(g.lastRolls[3], 0);
  assert.equal(g.flags[3], FLAG.NONE); // flag consumed
});

test('up-only flag forces a positive roll and is reported on the event', () => {
  for (let seed = 0; seed < 25; seed++) {
    const g = new Game({ mode: 1, seed });
    g.flags[2] = FLAG.UP;
    const events = g.roll();
    assert.ok(g.lastRolls[2] > 0, `seed ${seed} rolled ${g.lastRolls[2]}`);
    const e = events.find((ev) => ev.type === 'roll' && ev.mascotId === 2);
    assert.equal(e.flag, FLAG.UP);
  }
});

test('coins increment with interest capped at 5', () => {
  const g = new Game({ mode: 1, seed: 5 });
  const p = g.players[0];
  p.coins = 12; // interest floor(12/5)=2
  g.roll();
  assert.equal(p.coins, 12 + CONFIG.coinsPerRound + 2);
  p.coins = 60; // interest capped at 5
  g.roll();
  assert.equal(p.coins, 60 + CONFIG.coinsPerRound + 5);
});

test('manual refresh costs 1 coin the first time each round, then 2', () => {
  const g = new Game({ mode: 1, seed: 11 });
  const p = g.players[0];
  const coins = p.coins;
  assert.equal(g.refreshCost(0), 1);
  assert.ok(g.refreshTickets(0).ok);
  assert.equal(p.coins, coins - 1);
  assert.equal(g.refreshCost(0), 2);
  assert.ok(g.refreshTickets(0).ok);
  assert.ok(g.refreshTickets(0).ok);
  assert.equal(p.coins, coins - 1 - 2 - 2); // never more than 2
  // rolling resets the first-refresh discount
  g.roll();
  assert.equal(g.refreshCost(0), 1);
  p.coins = 0;
  assert.equal(g.refreshTickets(0).ok, false);
});

test('1P game ends after 10 rounds', () => {
  const g = new Game({ mode: 1, seed: 2 });
  let events = [];
  for (let i = 0; i < CONFIG.onePlayerRounds; i++) events = g.roll();
  assert.ok(g.over);
  assert.ok(events.some((e) => e.type === 'gameover'));
  assert.equal(g.roll().length, 0); // no-op after game over
});

test('2P game ends when a player reaches the goal', () => {
  const g = new Game({ mode: 2, seed: 2 });
  g.players[1].ep = CONFIG.twoPlayerGoal;
  g.roll();
  assert.ok(g.over);
  assert.equal(g.winner, 1);
});

test('double spell caps the bonus at +50', () => {
  const g = new Game({ mode: 1, seed: 8 });
  const p = g.players[0];
  p.ep = 100;
  p.spells[0] = 151; // Double Mousey
  p.board[1][60] = 80;
  const res = g.castSpell(0, 0, 60);
  assert.ok(res.ok);
  assert.equal(p.board[1][60], 130); // 80*2=160 would exceed +50 cap
  assert.equal(p.ep, 100 - 10);
});

test('steal spell transfers up to 50 EP between boards', () => {
  const g = new Game({ mode: 2, seed: 8 });
  const [a, b] = g.players;
  a.ep = 100;
  a.spells[0] = 254; // Steal Bizarro
  b.board[2][40] = 30;
  const res = g.castSpell(0, 0, 40);
  assert.ok(res.ok);
  assert.equal(res.stolen, 30);
  assert.equal(a.board[2][40], 30);
  assert.equal(b.board[2][40], undefined);
});

test('halve spell never removes more than 50', () => {
  const g = new Game({ mode: 2, seed: 8 });
  const [a, b] = g.players;
  a.ep = 100;
  a.spells[0] = 152; // Halve Mousey
  b.board[1][55] = 200;
  g.castSpell(0, 0, 55);
  assert.equal(b.board[1][55], 150); // half would remove 100 -> capped at 50
});

test('move spell collects immediately when mascot is close enough', () => {
  const g = new Game({ mode: 1, seed: 8 });
  const p = g.players[0];
  p.ep = 100;
  p.spells[0] = 253; // Move EP 6 closer to Bizarro
  p.board[2][55] = 42; // Bizarro at 50, within 6
  const res = g.castSpell(0, 0, 55);
  assert.ok(res.ok);
  assert.equal(res.collected, 42);
  assert.equal(p.ep, 100 - 15 + 42);
});

test('move spell moves EP toward the mascot when out of range', () => {
  const g = new Game({ mode: 1, seed: 8 });
  const p = g.players[0];
  p.ep = 100;
  p.spells[0] = 153; // Move EP 2 closer to Mousey
  p.board[1][60] = 30;
  const res = g.castSpell(0, 0, 60);
  assert.equal(res.movedTo, 58);
  assert.equal(p.board[1][58], 30);
});

test('targeted spells refuse invalid steps', () => {
  const g = new Game({ mode: 1, seed: 8 });
  const p = g.players[0];
  p.ep = 100;
  p.spells[0] = 151;
  assert.equal(g.castSpell(0, 0, 60).ok, false); // no EP anywhere
  p.board[1][40] = 5;
  assert.equal(g.castSpell(0, 0, 41).ok, false); // wrong step
  assert.ok(g.castSpell(0, 0, 40).ok);
});

test('solo mode never offers opponent-targeting or freeze spells', () => {
  for (let seed = 0; seed < 40; seed++) {
    const g = new Game({ mode: 1, seed });
    g.players[0].ep = 600; // level 5 pool includes halve/steal/freeze weights
    g.refreshSpells(0);
    for (const id of g.players[0].spells) {
      const s = spellById(id);
      assert.ok(!s.targetsOpponent, `seed ${seed} offered opponent spell ${id}`);
      assert.notEqual(s.type, SPELL_TYPES.FREEZE, `seed ${seed} offered freeze ${id}`);
    }
  }
  // 2P still gets freeze at level 5
  let sawFreeze = false;
  for (let seed = 0; seed < 200 && !sawFreeze; seed++) {
    const g = new Game({ mode: 2, seed });
    g.players[0].ep = 600;
    g.refreshSpells(0);
    sawFreeze = g.players[0].spells.some((id) => spellById(id).type === SPELL_TYPES.FREEZE);
  }
  assert.ok(sawFreeze, '2P mode should still offer freeze spells');
});

test('alerts report "until the game ends" late in a 1P game', () => {
  const g = new Game({ mode: 1, seed: 5 });
  assert.equal(g.roundsLeft(), CONFIG.onePlayerRounds);
  assert.equal(g.alertOutlastsGame(), false);
  g.round = 8; // 2 rounds left, shorter than a 3-roll alert
  assert.equal(g.roundsLeft(), 2);
  assert.ok(g.alertOutlastsGame());
  g.news = [];
  g.rng = () => 0.01; // Mousey Oil Strike
  const events = [];
  g.drawNews(events);
  assert.match(events[0].message, /until the game ends/);
  // 2P games never say it
  const g2 = new Game({ mode: 2, seed: 5 });
  g2.round = 99;
  assert.equal(g2.alertOutlastsGame(), false);
});

test('news table matches spec: weights per mascot, 65% total', () => {
  const w = (id, dir) => NEWS_TABLE.find((r) => r.mascotId === id && r.direction === dir).weight;
  assert.deepEqual([w(1, 1), w(2, 1), w(3, 1), w(4, 1)], [8, 10, 5, 12]); // Oil Strike
  assert.deepEqual([w(1, -1), w(2, -1), w(3, -1), w(4, -1)], [8, 7, 5, 10]); // Earthquake
  assert.equal(NEWS_TABLE.reduce((s, r) => s + r.weight, 0), 65);
});

test('news draw activates an alert and wastes same-mascot draws', () => {
  const g = new Game({ mode: 1, seed: 1 });
  g.news = []; // clear any game-start alert
  for (const m of MASCOTS) g.flags[m.id] = FLAG.NONE;
  // r*100 = 1 -> first row: Mousey Oil Strike (weight 8)
  g.rng = () => 0.01;
  const ev1 = [];
  g.drawNews(ev1);
  assert.equal(g.news.length, 1);
  assert.equal(g.news[0].mascotId, 1);
  assert.equal(g.news[0].newsType, 'Oil Strike');
  assert.equal(g.flags[1], FLAG.UP);
  // Same draw again: Mousey already has an alert -> wasted
  const ev2 = [];
  g.drawNews(ev2);
  assert.equal(g.news.length, 1);
  assert.equal(ev2.length, 0);
  // r*100 = 12 -> Bizarro Oil Strike (8..18) -> second concurrent alert
  g.rng = () => 0.12;
  g.drawNews(ev2);
  assert.equal(g.news.length, 2);
  // A third mascot's alert stacks too — only per-mascot exclusivity limits alerts
  g.rng = () => 0.20; // Wolf Oil Strike (18..23)
  const ev3 = [];
  g.drawNews(ev3);
  assert.equal(g.news.length, 3);
  assert.equal(ev3.length, 1);
  // ...but repeat draws for any alerted mascot are still wasted
  g.drawNews(ev3);
  assert.equal(g.news.length, 3);
  assert.equal(ev3.length, 1);
  // r*100 = 70 -> beyond the 65% table: no alert
  g.news = [];
  g.rng = () => 0.70;
  const ev4 = [];
  g.drawNews(ev4);
  assert.equal(g.news.length, 0);
});

test('spell shop never offers a spell redundant with an active alert', () => {
  for (let seed = 0; seed < 30; seed++) {
    const g = new Game({ mode: 2, seed });
    g.news = [{ mascotId: 4, direction: 1, newsType: 'Oil Strike', count: 1 }];
    g.players[0].ep = 600; // level 5, where up/down spells are common
    for (let i = 0; i < 5; i++) {
      g.refreshSpells(0);
      assert.ok(!g.players[0].spells.includes(455), `seed ${seed}: offered Flixy-up during a Flixy Oil Strike`);
    }
  }
});

test('alerts last 3 rolls then expire', () => {
  const g = new Game({ mode: 1, seed: 1 });
  g.news = [{ mascotId: 3, direction: -1, newsType: 'Earthquake', count: 1 }];
  g.rng = () => 0.99; // no new draws
  g.updateNews([]);
  assert.equal(g.news[0].count, 2);
  assert.equal(g.flags[3], FLAG.DOWN);
  g.updateNews([]);
  assert.equal(g.news[0].count, 3);
  const endEvents = [];
  g.flags[3] = FLAG.DOWN; // as re-armed
  g.updateNews(endEvents);
  assert.equal(g.news.length, 0);
  assert.ok(endEvents.some((e) => e.type === 'newsEnd'));
  assert.equal(g.flags[3], FLAG.NONE);
});

test('a game can start with an alert already active', () => {
  let found = 0;
  for (let seed = 0; seed < 30; seed++) {
    const g = new Game({ mode: 1, seed });
    if (g.news.length > 0) {
      found++;
      assert.equal(g.news[0].count, 1);
      assert.ok(g.startEvents.some((e) => e.type === 'news'));
      assert.equal(g.flags[g.news[0].mascotId], g.news[0].direction);
    }
  }
  assert.ok(found > 5, `only ${found}/30 games started with news (expected ~65%)`);
});

test('board steps stay within 0..100', () => {
  const g = new Game({ mode: 1, seed: 4 });
  g.steps[2] = 99;
  g.rollForMascot = (m) => (m.id === 2 ? 10 : 0);
  g.roll();
  assert.equal(g.steps[2], 100);
});

test('collectProbability matches hand-computed one-roll odds', () => {
  const wolf = MASCOTS.find((m) => m.name === 'Wolf');
  const mousey = MASCOTS.find((m) => m.name === 'Mousey');
  const bizarro = MASCOTS.find((m) => m.name === 'Bizarro');
  // Wolf down 1 in one roll: faces -1 and -2 hit -> 20%
  assert.ok(Math.abs(collectProbability(wolf, [-1], 1) - 0.2) < 1e-12);
  // Mousey up 1 in one roll: five positive faces -> 50%
  assert.ok(Math.abs(collectProbability(mousey, [1], 1) - 0.5) < 1e-12);
  // Bizarro +2/-2 in one roll: every face has |move| >= 2 -> 100%
  assert.ok(Math.abs(collectProbability(bizarro, [2, -2], 1) - 1) < 1e-12);
});

test('collectProbability respects a forced-direction alert', () => {
  const bizarro = MASCOTS.find((m) => m.name === 'Bizarro');
  // Down-only for 1 roll: an Up 1 bounty can't pay this roll
  assert.equal(collectProbability(bizarro, [1], 1, { direction: -1, rolls: 1 }), 0);
  // ...but a Down 1 bounty is guaranteed (all down faces are <= -4)
  assert.equal(collectProbability(bizarro, [-1], 1, { direction: -1, rolls: 1 }), 1);
  // After the alert expires the walk can recover: 2-roll horizon, 1-roll alert
  const p = collectProbability(bizarro, [1], 2, { direction: -1, rolls: 1 });
  assert.ok(p > 0 && p < 0.5, `expected partial recovery, got ${p}`);
});

test('collectProbability grows with the horizon', () => {
  const mousey = MASCOTS.find((m) => m.name === 'Mousey');
  let prev = 0;
  for (let n = 1; n <= 6; n++) {
    const p = collectProbability(mousey, [3], n);
    assert.ok(p >= prev && p <= 1);
    prev = p;
  }
});

test('odds horizon is a 4-roll window, shrinking at the end of 1P games', () => {
  const g = new Game({ mode: 1, seed: 6 });
  assert.equal(g.oddsHorizon(), 4);
  g.round = 8;
  assert.equal(g.oddsHorizon(), 2);
  g.round = 10;
  assert.equal(g.oddsHorizon(), 1);
  const g2 = new Game({ mode: 2, seed: 6 });
  g2.round = 30;
  assert.equal(g2.oddsHorizon(), 4);
});

test('oddsLabel buckets probabilities', () => {
  assert.equal(oddsLabel(0.9), 'Very Easy');
  assert.equal(oddsLabel(0.6), 'Easy');
  assert.equal(oddsLabel(0.45), 'Medium');
  assert.equal(oddsLabel(0.3), 'Hard');
  assert.equal(oddsLabel(0.1), 'Very Hard');
});

test('mascot display order is Mousey, Wolf, Flixy, Bizarro', () => {
  assert.deepEqual(MASCOTS.map((m) => m.name), ['Mousey', 'Wolf', 'Flixy', 'Bizarro']);
});

test('roguelike: starts with a 2-mascot choice; everything scopes to the roster', () => {
  const g = new Game({ mode: 'rogue', seed: 3 });
  assert.ok(g.rogue);
  assert.equal(g.activeMascots.length, 0);
  assert.equal(g.pendingChoice.length, 2);
  assert.notEqual(g.pendingChoice[0], g.pendingChoice[1]);
  assert.equal(g.roll().length, 0); // rolling is blocked until the choice is made
  assert.equal(g.chooseMascot(99).ok, false);
  const pick = g.pendingChoice[0];
  assert.ok(g.chooseMascot(pick).ok);
  assert.deepEqual(g.activeMascots, [pick]);
  // two ticket slots to start, both for the chosen mascot, locked slots refuse buys
  const offers = g.players[0].tickets.filter(Boolean);
  assert.equal(offers.length, 2);
  for (const id of offers) assert.equal(Math.floor(id / 100), pick);
  assert.equal(g.buyTicket(0, 3).ok, false);
  // spells are locked until the 2nd mascot joins
  assert.deepEqual(g.players[0].spells, [null, null]);
  assert.equal(g.castSpell(0, 0).ok, false);
  const rolls = g.roll().filter((e) => e.type === 'roll');
  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].mascotId, pick);
});

test('roguelike: slots, rarity gates, and spells all grow with the roster', () => {
  const tierOf = (id) => id % 100;
  for (let seed = 0; seed < 25; seed++) {
    const g = new Game({ mode: 'rogue', seed });
    g.players[0].ep = 600; // level 5, where epic/legendary weights are highest
    g.chooseMascot(g.pendingChoice[0]);
    // one mascot: 2 distinct offers, no Epics (tiers 4/5) or Legendaries (10)
    let offers = g.players[0].tickets.filter(Boolean);
    assert.equal(offers.length, 2);
    assert.equal(new Set(offers).size, 2, `seed ${seed}: ${offers}`);
    for (const id of offers) assert.ok(![4, 5, 10].includes(tierOf(id)), `seed ${seed}: epic/legendary too early (${id})`);
    assert.equal(g.spellSlotCount(), 0);
    // two mascots: 3 offers, Epics allowed, no Legendaries; one spell slot
    g.pendingChoice = g.pickChoice();
    g.chooseMascot(g.pendingChoice[0]);
    offers = g.players[0].tickets.filter(Boolean);
    assert.equal(offers.length, 3);
    assert.equal(new Set(offers).size, 3, `seed ${seed} (2 mascots): ${offers}`);
    for (const id of offers) assert.notEqual(tierOf(id), 10, `seed ${seed}: legendary too early (${id})`);
    assert.equal(g.spellSlotCount(), 1);
    assert.notEqual(g.players[0].spells[0], null);
    assert.equal(g.players[0].spells[1], null);
    // three mascots: full 4 offers and both spell slots
    g.pendingChoice = g.pickChoice();
    g.chooseMascot(g.pendingChoice[0]);
    assert.equal(g.players[0].tickets.filter(Boolean).length, 4);
    assert.equal(g.spellSlotCount(), 2);
    assert.notEqual(g.players[0].spells[1], null);
  }
});

test('roguelike: checkpoints end the run or grow the roster', () => {
  const g = new Game({ mode: 'rogue', seed: 4 });
  g.chooseMascot(g.pendingChoice[0]);
  g.roll();
  g.roll();
  g.players[0].ep = ROGUE.targets[3] - 1;
  g.roll();
  assert.ok(g.over);
  assert.equal(g.winner, false);
  assert.deepEqual(g.failedCheckpoint, { round: 3, target: ROGUE.targets[3] });

  const g2 = new Game({ mode: 'rogue', seed: 4 });
  const firstPick = g2.pendingChoice[0];
  g2.chooseMascot(firstPick);
  g2.roll();
  g2.roll();
  g2.players[0].ep = ROGUE.targets[3] + 50;
  g2.roll();
  assert.ok(!g2.over);
  assert.equal(g2.pendingChoice.length, 2);
  assert.ok(!g2.pendingChoice.includes(firstPick));
  g2.chooseMascot(g2.pendingChoice[1]);
  assert.equal(g2.activeMascots.length, 2);
  const counts = {};
  for (const id of g2.players[0].tickets.filter(Boolean)) {
    const m = Math.floor(id / 100);
    counts[m] = (counts[m] || 0) + 1;
  }
  assert.deepEqual(Object.values(counts).sort(), [1, 2]); // 3 slots: 1 each + 1 random
});

test('roguelike: three-mascot shop is 1 each plus 1 random repeat', () => {
  for (let seed = 0; seed < 15; seed++) {
    const g = new Game({ mode: 'rogue', seed });
    g.activeMascots = [1, 3, 4];
    g.pendingChoice = null;
    g.refreshTickets(0, { free: true });
    const counts = { 1: 0, 3: 0, 4: 0 };
    for (const id of g.players[0].tickets) counts[Math.floor(id / 100)] += 1;
    assert.equal(counts[1] + counts[3] + counts[4], 4);
    for (const c of Object.values(counts)) assert.ok(c >= 1 && c <= 2, `seed ${seed}: ${JSON.stringify(counts)}`);
  }
});

test('roguelike: benched mascots make no news; victory after round 15', () => {
  const g = new Game({ mode: 'rogue', seed: 8 });
  g.chooseMascot(g.pendingChoice[0]);
  const active = g.activeMascots[0];
  let acc = 0;
  let rngValue = null;
  for (const row of NEWS_TABLE) {
    if (row.mascotId !== active) { rngValue = (acc + 0.5) / 100; break; }
    acc += row.weight;
  }
  g.rng = () => rngValue;
  const ev = [];
  g.drawNews(ev);
  assert.equal(g.news.length, 0, 'inactive-mascot draw must be suppressed');
  assert.equal(ev.length, 0);

  const g2 = new Game({ mode: 'rogue', seed: 8 });
  g2.chooseMascot(g2.pendingChoice[0]);
  g2.activeMascots = MASCOTS.map((m) => m.id);
  g2.round = 14;
  g2.players[0].ep = ROGUE.targets[15] + 5;
  g2.roll();
  assert.ok(g2.over);
  assert.equal(g2.winner, true);
});

test('bots at every level play legal games to completion', () => {
  for (const level of Object.keys(BOT_LEVELS)) {
    for (let seed = 0; seed < 12; seed++) {
      const g = new Game({ mode: 2, seed });
      let rounds = 0;
      while (!g.over && rounds < 40) {
        botTakeTurn(g, level);
        g.roll();
        rounds += 1;
      }
      const bot = g.players[1];
      assert.ok(bot.coins >= 0, `${level} seed ${seed}: negative coins`);
      assert.ok(bot.ep >= 0, `${level} seed ${seed}: negative EP`);
    }
  }
});

test('no bot buys a ticket whose targets are all blocked by an alert', () => {
  for (const level of Object.keys(BOT_LEVELS)) {
    for (let seed = 0; seed < 20; seed++) {
      const g = new Game({ mode: 2, seed });
      g.news = [{ mascotId: 2, direction: -1, newsType: 'Earthquake', count: 1 }];
      g.flags[2] = FLAG.DOWN;
      const bot = g.players[1];
      bot.tickets = [101, 301, 401, 202]; // 202 = Bizarro "Up 1": dead while Bizarro is Down-only
      bot.coins = 50;
      botTakeTurn(g, level);
      assert.equal(bot.ticketSold[3], false, `${level} seed ${seed} bought a dead ticket`);
    }
  }
});

test('the hard bot outscores the easy bot on average', () => {
  const avgEP = (level) => {
    let total = 0;
    const games = 50;
    for (let seed = 0; seed < games; seed++) {
      const g = new Game({ mode: 2, seed });
      for (let r = 0; r < 10 && !g.over; r++) {
        botTakeTurn(g, level);
        if (!g.over) g.roll();
      }
      total += g.players[1].ep;
    }
    return total / games;
  };
  const easy = avgEP('easy');
  const hard = avgEP('hard');
  assert.ok(hard > easy, `hard avg ${hard} should beat easy avg ${easy}`);
});

test('simulated 1P games finish with sane scores', () => {
  // Smoke test: play 200 random games buying greedily, ensure no crashes and
  // plausible score ranges.
  let total = 0;
  for (let seed = 0; seed < 200; seed++) {
    const g = new Game({ mode: 1, seed });
    while (!g.over) {
      for (let slot = 0; slot < 4; slot++) g.buyTicket(0, slot);
      g.roll();
    }
    total += g.players[0].ep;
    assert.ok(g.players[0].ep >= 0);
  }
  const avg = total / 200;
  assert.ok(avg > 50 && avg < 2000, `average score ${avg} out of expected range`);
});
