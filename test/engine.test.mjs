import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, FLAG } from '../src/engine.js';
import {
  MASCOTS, TICKETS, SPELLS, CONFIG, START_STEP,
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

test('up-only flag forces a positive roll', () => {
  for (let seed = 0; seed < 25; seed++) {
    const g = new Game({ mode: 1, seed });
    g.flags[2] = FLAG.UP;
    g.roll();
    assert.ok(g.lastRolls[2] > 0, `seed ${seed} rolled ${g.lastRolls[2]}`);
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

test('manual refresh costs 2 coins and redraws offers', () => {
  const g = new Game({ mode: 1, seed: 11 });
  const p = g.players[0];
  const coins = p.coins;
  const res = g.refreshTickets(0);
  assert.ok(res.ok);
  assert.equal(p.coins, coins - CONFIG.refreshCost);
  p.coins = 1;
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

test('solo mode never offers opponent-targeting spells', () => {
  for (let seed = 0; seed < 40; seed++) {
    const g = new Game({ mode: 1, seed });
    g.players[0].ep = 600; // level 5 pool includes halve/steal weights
    g.refreshSpells(0);
    for (const id of g.players[0].spells) {
      assert.ok(!spellById(id).targetsOpponent, `seed ${seed} offered ${id}`);
    }
  }
});

test('mascot news arms a direction and expires after 3 rolls', () => {
  const g = new Game({ mode: 1, seed: 1 });
  // Force the news draw deterministically: r=0.96 -> Mousey up
  const realRng = g.rng;
  g.updateNews = Game.prototype.updateNews.bind(g);
  g.rng = () => 0.96;
  const events = [];
  Game.prototype.updateNews.call(g, events);
  assert.ok(g.news && g.news.mascotId === 1 && g.news.direction === 1);
  assert.equal(g.flags[1], FLAG.UP);
  g.rng = realRng;
  // Two more update calls re-arm, the third clears
  Game.prototype.updateNews.call(g, []);
  assert.equal(g.news.count, 2);
  Game.prototype.updateNews.call(g, []);
  assert.equal(g.news.count, 3);
  const endEvents = [];
  Game.prototype.updateNews.call(g, endEvents);
  assert.equal(g.news, null);
  assert.ok(endEvents.some((e) => e.type === 'newsEnd'));
});

test('board steps stay within 0..100', () => {
  const g = new Game({ mode: 1, seed: 4 });
  g.steps[2] = 99;
  g.rollForMascot = (m) => (m.id === 2 ? 10 : 0);
  g.roll();
  assert.equal(g.steps[2], 100);
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
