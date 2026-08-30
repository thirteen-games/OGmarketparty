// Shared balance-sim machinery: probability math and the four calibration
// archetypes that play roguelike runs with "real behavior" (alert-aware
// EV shopping, sensible spell casting, real gates).
import * as data from '../../../../src/data.js';
import { Game } from '../../../../src/engine.js';
import { collectProbability } from '../../../../src/odds.js';

export { data, Game, collectProbability };
const { ticketById, spellById, mascotById, CONFIG, SPELL_TYPES } = data;

// The pricing baseline: expected EP per coin for a ratio-1.0 (cost 1) ticket.
// Every tier's parity reward is B * cost * ratio / P(payout in the 4-roll
// shop window). Derived from the prototype's tier-1 tickets.
export const BASELINE_EP_PER_COIN = 8.3;
export const SHOP_WINDOW = 4; // rolls; matches the in-game odds labels

// P(BOTH targets collected within `rolls` rolls). A chip counts as hit when
// any roll's traversed interval covers it, in either direction.
export function bothProbability(mascot, up, down, rolls = 5) {
  const faces = mascot.rolls;
  const pf = 1 / faces.length;
  let dist = new Map([['0|0|0', 1]]);
  let done = 0;
  for (let k = 0; k < rolls; k++) {
    const next = new Map();
    for (const [key, prob] of dist) {
      const [pos, hu, hd] = key.split('|').map(Number);
      for (const m of faces) {
        const np = pos + m;
        const coversUp = m > 0 ? (up > pos && up <= np) : (up >= np && up < pos);
        const coversDown = m > 0 ? (down > pos && down <= np) : (down >= np && down < pos);
        const nu = hu || coversUp ? 1 : 0;
        const nd = hd || coversDown ? 1 : 0;
        if (nu && nd) { done += prob * pf; continue; }
        const nk = `${np}|${nu}|${nd}`;
        next.set(nk, (next.get(nk) || 0) + prob * pf);
      }
    }
    dist = next;
  }
  return done;
}

export function constraintFor(g, mascotId) {
  const a = g.news.find((x) => x.mascotId === mascotId);
  return a ? { direction: a.direction, rolls: CONFIG.newsDurationRolls - a.count + 1 } : null;
}

export function deadUnderAlert(g, t) {
  const a = g.news.find((x) => x.mascotId === t.mascotId);
  if (!a) return false;
  return [t.target1, t.target2].filter((o) => o !== null).every((o) => Math.sign(o) !== a.direction);
}

// Alert-aware expected EP of a ticket (both targets pay independently).
export function ticketEV(g, t) {
  const m = mascotById(t.mascotId);
  const c = constraintFor(g, t.mascotId);
  return [t.target1, t.target2]
    .filter((o) => o !== null)
    .reduce((s, o) => s + collectProbability(m, [o], g.oddsHorizon(), c) * t.reward, 0);
}

// Live offers ranked by EV per coin, skipping alert-dead tickets — how a
// player who reads the difficulty labels shops.
export function rankedOffers(g, p = 0) {
  const player = g.players[p];
  return [0, 1, 2, 3]
    .filter((s) => player.tickets[s] && !player.ticketSold[s])
    .map((s) => ({ slot: s, t: ticketById(player.tickets[s]) }))
    .filter((o) => !deadUnderAlert(g, o.t))
    .map((o) => ({ ...o, evc: ticketEV(g, o.t) / o.t.cost }))
    .sort((a, b) => b.evc - a.evc);
}

export function shopIsBad(g) {
  const offers = rankedOffers(g);
  return !offers.length || offers[0].evc < 3;
}

// Cast spells only when the expected return beats the EP price (mirrors the
// hard bot: Double on reachable value, Move for instant collections, Up/Down
// when the board leans hard).
export function castSensibleSpells(g, p = 0) {
  const player = g.players[p];
  for (let slot = 0; slot < 2; slot++) {
    const id = player.spells[slot];
    if (!id || player.spellSold[slot]) continue;
    const spell = spellById(id);
    if (player.ep < spell.cost) continue;
    const m = mascotById(spell.mascotId);
    const pos = g.steps[m.id];
    const c = constraintFor(g, m.id);
    const chips = Object.entries(player.board[m.id])
      .map(([s, ep]) => ({ step: +s, ep })).filter((x) => x.ep > 0);
    const biggest = chips.reduce((a, b) => (b.ep > a.ep ? b : a), { ep: 0, step: null });
    if (spell.type === SPELL_TYPES.DOUBLE) {
      if (biggest.step === null) continue;
      const gain = Math.min(biggest.ep, 50) * collectProbability(m, [biggest.step - pos], g.oddsHorizon(), c);
      if (gain > spell.cost * 1.2) g.castSpell(p, slot, biggest.step);
    } else if (spell.type === SPELL_TYPES.MOVE) {
      const instant = chips.filter((x) => Math.abs(x.step - pos) <= m.epMoveSteps);
      const best = instant.reduce((a, b) => (b.ep > a.ep ? b : a), { ep: 0, step: null });
      if (best.ep > spell.cost) g.castSpell(p, slot, best.step);
    } else if (spell.type === SPELL_TYPES.UP || spell.type === SPELL_TYPES.DOWN) {
      const dir = spell.type === SPELL_TYPES.UP ? 1 : -1;
      const net = chips.reduce((s, x) => s + Math.sign(x.step - pos) * dir * x.ep, 0);
      if (net >= spell.cost * 2) g.castSpell(p, slot);
    }
  }
}

// The four coin-strategy archetypes used for gate calibration.
export const ARCHETYPES = {
  'P1 max-spend': maxSpend,
  'P2 5s-saver': saver,
  'P3 half-spend': halfSpend,
  'P4 spend->save': (g) => (g.round + 1 <= 5 ? maxSpend : saver)(g),
};

function maxSpend(g) {
  const p = g.players[0];
  for (let guard = 0; guard < 20; guard++) {
    let bought = false;
    for (const o of rankedOffers(g)) {
      if (p.coins >= o.t.cost && g.buyTicket(0, o.slot).ok) bought = true;
    }
    if (bought) continue;
    const cost = g.refreshCost(0);
    if (p.coins - cost > 2) { g.refreshTickets(0); } else break;
  }
}

function saver(g) {
  const p = g.players[0];
  const round = g.round + 1;
  const floor = round > data.ROGUE.rounds - 3 ? 0 : Math.min(25, 5 * Math.ceil(round / 2));
  if (shopIsBad(g) && p.coins - g.refreshCost(0) >= floor) g.refreshTickets(0);
  for (const o of rankedOffers(g)) {
    if (p.coins - o.t.cost >= floor) g.buyTicket(0, o.slot);
  }
}

function halfSpend(g) {
  const p = g.players[0];
  let budget = Math.floor(p.coins / 2);
  if (shopIsBad(g) && g.refreshCost(0) <= budget) { budget -= g.refreshCost(0); g.refreshTickets(0); }
  for (const o of rankedOffers(g)) {
    if (o.t.cost <= budget && g.buyTicket(0, o.slot).ok) budget -= o.t.cost;
  }
}

// Play one roguelike run with an archetype. Returns per-mark EP, gate
// survival, bonuses earned, and the outcome.
export function playRogueRun(seed, act, marks = [3, 6, 9, 12, 15]) {
  const g = new Game({ mode: 'rogue', seed });
  const atMark = {};
  const aliveAt = {};
  const bonuses = [];
  let guard = 0;
  while (!g.over && guard++ < 40) {
    if (g.pendingChoice) g.chooseMascot(g.pendingChoice[Math.floor(g.rng() * g.pendingChoice.length)]);
    act(g);
    castSensibleSpells(g);
    const events = g.roll();
    for (const e of events) if (e.type === 'bonus') bonuses.push(e.round);
    if (marks.includes(g.round)) {
      atMark[g.round] = g.players[0].ep;
      aliveAt[g.round] = !g.failedCheckpoint || g.failedCheckpoint.round !== g.round;
    }
  }
  return { won: g.winner === true, atMark, aliveAt, bonuses, failedAt: g.failedCheckpoint?.round ?? null };
}
