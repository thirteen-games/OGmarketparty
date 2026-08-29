// Market Party — game engine (no DOM). Port of the VBA logic in
// "MP Proto V1.0 for Claude.xlsm" (Module6/Module9) plus the workbook's
// lookup tables (see data.js).

import {
  BOARD_MIN, BOARD_MAX, START_STEP, CONFIG,
  MASCOTS, TICKETS, SPELLS, TICKET_TIER_WEIGHTS, SPELL_TYPE_WEIGHTS,
  NEWS_TABLE, SPELL_TYPES,
  mascotById, ticketById, spellById, epLevelFor,
} from './data.js';
import { makeRng, weightedPick } from './rng.js';

const clamp = (v) => Math.max(BOARD_MIN, Math.min(BOARD_MAX, v));

// Movement flags (Betting Tickets AD8:AD11 in the workbook — shared between
// players): 0 none, 1 up-only, -1 down-only, 2 frozen.
export const FLAG = { NONE: 0, UP: 1, DOWN: -1, FREEZE: 2 };

function emptyBoard() {
  const board = {};
  for (const m of MASCOTS) board[m.id] = {}; // step -> EP amount
  return board;
}

function newPlayer() {
  return {
    coins: CONFIG.startingCoins,
    ep: 0,
    board: emptyBoard(),
    tickets: [null, null, null, null], // offer per mascot slot
    ticketSold: [false, false, false, false],
    spells: [null, null],
    spellSold: [false, false],
  };
}

export class Game {
  constructor({ mode = 1, seed } = {}) {
    if (mode !== 1 && mode !== 2) throw new Error('mode must be 1 or 2');
    this.rng = makeRng(seed);
    this.mode = mode;
    this.round = 0;
    this.over = false;
    this.winner = null; // 0/1 player index, 'tie', or (1P) true/false for goal reached
    this.steps = {};    // mascotId -> current step
    this.lastRolls = {}; // mascotId -> last roll value
    this.lastFrom = {};  // mascotId -> step before the last roll (for the trail)
    this.flags = {};    // mascotId -> FLAG
    this.news = [];     // active alerts: {mascotId, direction, newsType, count}
    this.players = [newPlayer()];
    if (mode === 2) this.players.push(newPlayer());
    for (const m of MASCOTS) {
      this.steps[m.id] = START_STEP;
      this.lastRolls[m.id] = 0;
      this.lastFrom[m.id] = START_STEP;
      this.flags[m.id] = FLAG.NONE;
    }
    for (let p = 0; p < this.players.length; p++) {
      this.refreshTickets(p, { free: true });
      this.refreshSpells(p);
    }
    // A news draw happens before round 1 too.
    this.startEvents = [];
    this.drawNews(this.startEvents);
  }

  playerLevel(p) {
    return epLevelFor(this.players[p].ep);
  }

  // Horizon for live ticket odds: a 4-roll window, shrinking near the end
  // of a 1P game when fewer rolls remain.
  oddsHorizon() {
    const window = 4;
    if (this.mode === 1) {
      return Math.max(1, Math.min(window, CONFIG.onePlayerRounds - this.round));
    }
    return window;
  }

  // --- Shops -------------------------------------------------------------

  drawTicketTier(level) {
    const entries = Object.entries(TICKET_TIER_WEIGHTS)
      .map(([tier, w]) => ({ value: Number(tier), weight: w[level - 1] }))
      .filter((e) => e.weight > 0);
    return weightedPick(this.rng, entries);
  }

  refreshTickets(p, { free = false } = {}) {
    const player = this.players[p];
    if (!free) {
      if (player.coins < CONFIG.refreshCost) return { ok: false, reason: 'Not enough Coins to refresh Bets' };
      player.coins -= CONFIG.refreshCost;
    }
    const level = this.playerLevel(p);
    // One independent tier draw per mascot (VBA GameSimRefreshCardShop).
    player.tickets = MASCOTS.map((m) => m.id * 100 + this.drawTicketTier(level));
    player.ticketSold = [false, false, false, false];
    return { ok: true };
  }

  spellPool(p) {
    const level = this.playerLevel(p);
    return SPELLS
      .map((s) => ({ value: s.id, weight: SPELL_TYPE_WEIGHTS[s.type][level - 1] }))
      // Opponent-targeting spells are useless in solo mode; keep them out of
      // the draw (the prototype offered them but refused the cast).
      .filter((e) => e.weight > 0 && !(this.mode === 1 && spellById(e.value).targetsOpponent));
  }

  refreshSpells(p) {
    const player = this.players[p];
    const pool = this.spellPool(p);
    const first = weightedPick(this.rng, pool);
    let second = weightedPick(this.rng, pool);
    while (second === first) second = weightedPick(this.rng, pool); // VBA RefreshSpell: must differ
    player.spells = [first, second];
    player.spellSold = [false, false];
  }

  // --- Betting -----------------------------------------------------------

  buyTicket(p, slot) {
    const player = this.players[p];
    if (this.over) return { ok: false, reason: 'Game is over' };
    if (player.ticketSold[slot]) return { ok: false, reason: 'Already bought this Bet this round' };
    const ticket = ticketById(player.tickets[slot]);
    if (player.coins < ticket.cost) return { ok: false, reason: 'Not enough Coins to make this Bet' };
    player.coins -= ticket.cost;
    player.ticketSold[slot] = true;
    const base = this.steps[ticket.mascotId];
    const placed = [];
    for (const offset of [ticket.target1, ticket.target2]) {
      if (offset === null) continue;
      const step = clamp(base + offset);
      player.board[ticket.mascotId][step] = (player.board[ticket.mascotId][step] || 0) + ticket.reward;
      placed.push({ step, amount: ticket.reward });
    }
    return { ok: true, ticket, placed };
  }

  // --- Spells ------------------------------------------------------------

  // Steps a targeted spell may act on (steps holding EP on the relevant board).
  spellTargets(p, slot) {
    const player = this.players[p];
    const spell = spellById(player.spells[slot]);
    if (!spell || !spell.needsTarget) return [];
    const owner = spell.targetsOpponent ? this.players[1 - p] : player;
    if (!owner) return [];
    return Object.entries(owner.board[spell.mascotId])
      .filter(([, ep]) => ep > 0)
      .map(([step]) => Number(step))
      .sort((a, b) => a - b);
  }

  castSpell(p, slot, targetStep = null) {
    const player = this.players[p];
    if (this.over) return { ok: false, reason: 'Game is over' };
    if (player.spellSold[slot]) return { ok: false, reason: 'Already bought this Spell this round' };
    const spell = spellById(player.spells[slot]);
    if (player.ep < spell.cost) return { ok: false, reason: 'Not enough EP to buy this Spell' };

    if (spell.needsTarget) {
      const targets = this.spellTargets(p, slot);
      if (targets.length === 0) {
        return { ok: false, reason: `No EP on any Steps for ${mascotById(spell.mascotId).name}` };
      }
      if (!targets.includes(targetStep)) {
        return { ok: false, reason: 'That Step has no EP, pick another please' };
      }
    }

    const result = this.applySpell(p, spell, targetStep);
    player.ep -= spell.cost;
    player.spellSold[slot] = true;
    return { ok: true, spell, ...result };
  }

  applySpell(p, spell, step) {
    const mid = spell.mascotId;
    const player = this.players[p];
    const opponent = this.players[1 - p];

    switch (spell.type) {
      case SPELL_TYPES.DOUBLE: {
        const v = player.board[mid][step];
        player.board[mid][step] = Math.min(v * 2, v + 50); // capped at +50 (VBA SpellDoubleEP)
        return { step, newValue: player.board[mid][step] };
      }
      case SPELL_TYPES.HALVE: {
        const v = opponent.board[mid][step];
        // VBA SpellHalveEP: halve, but never remove more than 50
        const halved = Math.floor(v / 2);
        opponent.board[mid][step] = halved > v - 50 ? halved : v - 50;
        if (opponent.board[mid][step] <= 0) delete opponent.board[mid][step];
        return { step, newValue: opponent.board[mid][step] || 0 };
      }
      case SPELL_TYPES.STEAL: {
        const v = opponent.board[mid][step];
        const taken = Math.min(50, v);
        opponent.board[mid][step] = v - taken;
        if (opponent.board[mid][step] <= 0) delete opponent.board[mid][step];
        player.board[mid][step] = (player.board[mid][step] || 0) + taken;
        return { step, stolen: taken };
      }
      case SPELL_TYPES.MOVE: {
        const n = mascotById(mid).epMoveSteps;
        const mascotStep = this.steps[mid];
        const v = player.board[mid][step];
        delete player.board[mid][step];
        // Collected immediately if the mascot is within n steps (VBA SpellMoveEPCloser).
        if (Math.abs(step - mascotStep) <= n) {
          player.ep += v;
          return { step, collected: v };
        }
        const dest = step > mascotStep ? step - n : step + n;
        player.board[mid][dest] = (player.board[mid][dest] || 0) + v;
        return { step, movedTo: dest };
      }
      case SPELL_TYPES.UP:
        this.flags[mid] = FLAG.UP;
        return {};
      case SPELL_TYPES.DOWN:
        this.flags[mid] = FLAG.DOWN;
        return {};
      case SPELL_TYPES.FREEZE:
        this.flags[mid] = FLAG.FREEZE;
        return {};
      default:
        throw new Error(`Unknown spell type ${spell.type}`);
    }
  }

  // --- Rolling -----------------------------------------------------------

  drawRoll(mascot) {
    return mascot.rolls[Math.floor(this.rng() * mascot.rolls.length)];
  }

  rollForMascot(mascot) {
    const flag = this.flags[mascot.id];
    this.flags[mascot.id] = FLAG.NONE; // flags are consumed by the roll (VBA PowerRoll)
    if (flag === FLAG.FREEZE) return 0;
    let roll = this.drawRoll(mascot);
    if (flag === FLAG.UP) while (roll <= 0) roll = this.drawRoll(mascot);
    if (flag === FLAG.DOWN) while (roll >= 0) roll = this.drawRoll(mascot);
    return roll;
  }

  // Resolve one round. Returns a list of events for the UI/log.
  roll() {
    if (this.over) return [];
    const events = [];
    this.round += 1;

    for (const mascot of MASCOTS) {
      const from = this.steps[mascot.id];
      const flag = this.flags[mascot.id]; // captured before the roll consumes it
      const rollValue = this.rollForMascot(mascot);
      const to = clamp(from + rollValue);
      this.steps[mascot.id] = to;
      this.lastRolls[mascot.id] = rollValue;
      this.lastFrom[mascot.id] = from;
      events.push({ type: 'roll', mascotId: mascot.id, roll: rollValue, from, to, flag });

      // Collect EP on every step the mascot passed over or landed on
      // (VBA *RewardCollect: exclusive of the start step, inclusive of the end).
      if (rollValue !== 0) {
        for (let p = 0; p < this.players.length; p++) {
          const board = this.players[p].board[mascot.id];
          for (const key of Object.keys(board)) {
            const step = Number(key);
            const passed = rollValue > 0 ? step > from && step <= to : step < from && step >= to;
            if (passed && board[step] > 0) {
              const amount = board[step];
              delete board[step];
              this.players[p].ep += amount;
              events.push({ type: 'collect', player: p, mascotId: mascot.id, step, amount });
            }
          }
        }
      }
    }

    this.checkGameOver(events);
    if (!this.over) {
      this.incrementCoins();
      for (let p = 0; p < this.players.length; p++) {
        this.refreshTickets(p, { free: true });
        this.refreshSpells(p);
      }
      this.updateNews(events);
    }
    return events;
  }

  incrementCoins() {
    this.lastCoinGain = this.players.map((player) => {
      const interest = Math.min(CONFIG.maxInterest, Math.floor(player.coins / CONFIG.interestDivisor));
      const gain = CONFIG.coinsPerRound + interest;
      player.coins += gain;
      return gain;
    });
  }

  checkGameOver(events) {
    if (this.mode === 1) {
      if (this.round >= CONFIG.onePlayerRounds) {
        this.over = true;
        this.winner = this.players[0].ep >= CONFIG.onePlayerGoal;
        events.push({ type: 'gameover', mode: 1, ep: this.players[0].ep, goalReached: this.winner });
      }
    } else {
      const [a, b] = this.players;
      if (a.ep >= CONFIG.twoPlayerGoal || b.ep >= CONFIG.twoPlayerGoal) {
        this.over = true;
        this.winner = a.ep > b.ep ? 0 : b.ep > a.ep ? 1 : 'tie';
        events.push({ type: 'gameover', mode: 2, winner: this.winner, scores: [a.ep, b.ep] });
      }
    }
  }

  // --- Mascot News ----------------------------------------------------------
  // Redesigned from the prototype: one weighted draw per round (including one
  // before round 1); alerts can overlap, but a draw for an already-alerted
  // mascot is wasted.

  drawNews(events) {
    const r = this.rng() * 100;
    let acc = 0;
    let row = null;
    for (const entry of NEWS_TABLE) {
      acc += entry.weight;
      if (r < acc) { row = entry; break; }
    }
    if (!row) return; // remaining probability: no alert this round
    if (this.news.some((a) => a.mascotId === row.mascotId)) return; // wasted draw
    this.news.push({ mascotId: row.mascotId, direction: row.direction, newsType: row.newsType, count: 1 });
    this.flags[row.mascotId] = row.direction;
    events.push({
      type: 'news',
      mascotId: row.mascotId,
      direction: row.direction,
      newsType: row.newsType,
      message: `Mascot News — ${row.newsType}! ${mascotById(row.mascotId).name} can only move ${row.direction > 0 ? 'Up' : 'Down'} for the next ${CONFIG.newsDurationRolls} rolls.`,
    });
  }

  updateNews(events) {
    const active = [];
    for (const alert of this.news) {
      if (alert.count < CONFIG.newsDurationRolls) {
        alert.count += 1;
        this.flags[alert.mascotId] = alert.direction; // re-arm for the next roll
        active.push(alert);
      } else {
        events.push({
          type: 'newsEnd',
          mascotId: alert.mascotId,
          message: `Mascot News! ${mascotById(alert.mascotId).name} is back to normal movement.`,
        });
        if (this.flags[alert.mascotId] === alert.direction) this.flags[alert.mascotId] = FLAG.NONE;
      }
    }
    this.news = active;
    this.drawNews(events);
  }
}
