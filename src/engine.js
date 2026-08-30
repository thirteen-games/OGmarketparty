// Market Party — game engine (no DOM). Port of the VBA logic in
// "MP Proto V1.0 for Claude.xlsm" (Module6/Module9) plus the workbook's
// lookup tables (see data.js).

import {
  BOARD_MIN, BOARD_MAX, START_STEP, CONFIG, ROGUE,
  MASCOTS, MASCOTS_PER_GAME, TICKETS, SPELLS, TICKET_TIER_WEIGHTS, SPELL_TYPE_WEIGHTS,
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
    refreshesThisRound: 0,
    spells: [null, null],
    spellSold: [false, false],
  };
}

export class Game {
  constructor({ mode = 1, seed } = {}) {
    // Roguelike is single-player with a growing mascot roster and checkpoints.
    this.rogue = mode === 'rogue';
    if (this.rogue) mode = 1;
    if (mode !== 1 && mode !== 2) throw new Error('mode must be 1, 2, or "rogue"');
    this.rng = makeRng(seed);
    this.mode = mode;
    this.round = 0;
    this.over = false;
    this.winner = null; // 0/1 player index, 'tie', or (1P) true/false for goal reached
    this.steps = {};    // mascotId -> current step
    this.lastRolls = {}; // mascotId -> last roll value
    this.lastFrom = {};  // mascotId -> step before the last roll (for the trail)
    this.rolledOnce = {}; // mascotId -> has taken at least one roll (a fresh draft hasn't)
    this.history = {};    // mascotId -> step after each of its rolls (starts at START_STEP)
    this.flags = {};    // mascotId -> FLAG
    this.news = [];     // active alerts: {mascotId, direction, newsType, count}
    this.players = [newPlayer()];
    if (mode === 2) this.players.push(newPlayer());
    for (const m of MASCOTS) {
      this.steps[m.id] = START_STEP;
      this.lastRolls[m.id] = 0;
      this.lastFrom[m.id] = START_STEP;
      this.rolledOnce[m.id] = false;
      this.history[m.id] = [START_STEP];
      this.flags[m.id] = FLAG.NONE;
    }
    // Roguelike: no mascots yet — the run starts by choosing one of two.
    // Classic modes: field MASCOTS_PER_GAME of the roster at random.
    if (this.rogue) {
      this.activeMascots = [];
    } else {
      const pool = MASCOTS.map((m) => m.id);
      this.activeMascots = [];
      while (this.activeMascots.length < Math.min(MASCOTS_PER_GAME, pool.length + this.activeMascots.length)) {
        this.activeMascots.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
      }
      const order = (id) => MASCOTS.findIndex((m) => m.id === id);
      this.activeMascots.sort((a, b) => order(a) - order(b));
    }
    this.pendingChoice = null;
    this.failedCheckpoint = null;

    // A news draw happens before round 1 too — before the shops fill, so the
    // spell pool can exclude alert-redundant offers.
    this.startEvents = [];
    if (this.rogue) {
      this.pendingChoice = this.pickChoice();
    } else {
      this.drawNews(this.startEvents);
      for (let p = 0; p < this.players.length; p++) {
        this.refreshTickets(p, { free: true });
        this.refreshSpells(p);
      }
    }
  }

  // --- Roguelike roster ------------------------------------------------------

  activeList() {
    return MASCOTS.filter((m) => this.activeMascots.includes(m.id));
  }

  isActive(mascotId) {
    return this.activeMascots.includes(mascotId);
  }

  // Up to two random mascots not yet in the game.
  pickChoice() {
    const pool = MASCOTS.map((m) => m.id).filter((id) => !this.isActive(id));
    if (pool.length <= 2) return pool;
    const first = pool.splice(Math.floor(this.rng() * pool.length), 1)[0];
    const second = pool[Math.floor(this.rng() * pool.length)];
    return [first, second];
  }

  chooseMascot(mascotId) {
    if (!this.pendingChoice || !this.pendingChoice.includes(mascotId)) {
      return { ok: false, reason: 'Not one of the offered mascots' };
    }
    this.activeMascots.push(mascotId);
    this.pendingChoice = null;
    for (let p = 0; p < this.players.length; p++) {
      this.refreshTickets(p, { free: true });
      this.refreshSpells(p);
    }
    return { ok: true };
  }

  playerLevel(p) {
    return epLevelFor(this.players[p].ep);
  }

  totalRounds() {
    if (this.rogue) return ROGUE.rounds;
    return this.mode === 1 ? CONFIG.onePlayerRounds : Infinity;
  }

  // Rolls left in the game: finite only in single-player modes.
  roundsLeft() {
    const total = this.totalRounds();
    return total === Infinity ? Infinity : Math.max(0, total - this.round);
  }

  // True when an alert starting now would still be running at the final roll.
  alertOutlastsGame() {
    return this.roundsLeft() < CONFIG.newsDurationRolls;
  }

  // Horizon for live ticket odds: a 4-roll window, shrinking near the end
  // of a single-player game when fewer rolls remain.
  oddsHorizon() {
    const window = 4;
    const left = this.roundsLeft();
    return left === Infinity ? window : Math.max(1, Math.min(window, left));
  }

  // --- Shops -------------------------------------------------------------

  drawTicketTier(level, exclude = null) {
    let entries = Object.entries(TICKET_TIER_WEIGHTS)
      .map(([tier, w]) => ({ value: Number(tier), weight: w[level - 1] }))
      .filter((e) => e.weight > 0);
    // Roguelike rarity gates by round: Super Rare (tier 4) can appear from
    // round 4, Epic (tier 5) from round 7, Legendary (tier 10) from round 10.
    // The shop serving round N+1 is drawn while this.round === N. Relative
    // odds among the allowed tiers hold.
    if (this.rogue) {
      entries = entries.filter((e) => {
        if (this.round < 3 && e.value === 4) return false;
        if (this.round < 6 && e.value === 5) return false;
        if (this.round < 9 && e.value === 10) return false;
        return true;
      });
    }
    // Draw without replacement within one mascot's offers (only matters when
    // a small roguelike roster gives a mascot several slots).
    if (exclude && exclude.size) {
      const remaining = entries.filter((e) => !exclude.has(e.value));
      if (remaining.length) entries = remaining;
    }
    return weightedPick(this.rng, entries);
  }

  // 1 Coin for the first manual refresh each round, 2 for every one after.
  refreshCost(p) {
    return this.players[p].refreshesThisRound === 0 ? CONFIG.refreshCostFirst : CONFIG.refreshCostNext;
  }

  refreshTickets(p, { free = false } = {}) {
    const player = this.players[p];
    if (free) {
      player.refreshesThisRound = 0; // new round: the discount comes back
    } else {
      const cost = this.refreshCost(p);
      if (player.coins < cost) return { ok: false, reason: 'Not enough Dollars to refresh Bets' };
      player.coins -= cost;
      player.refreshesThisRound += 1;
    }
    const level = this.playerLevel(p);
    // Offers split evenly among the active mascots. Roguelike opens with two
    // ticket slots and grows one per drafted mascot up to the normal four;
    // leftovers after the even split go to random active mascots.
    const ids = this.activeMascots;
    const slotCount = this.ticketSlotCount();
    const slots = [];
    for (const id of ids) {
      for (let i = 0; i < Math.floor(slotCount / ids.length); i++) slots.push(id);
    }
    const extras = [...ids];
    while (slots.length < slotCount && extras.length) {
      slots.push(extras.splice(Math.floor(this.rng() * extras.length), 1)[0]);
    }
    slots.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
    // One independent tier draw per slot (VBA GameSimRefreshCardShop), but a
    // mascot holding several slots never shows the same ticket twice.
    const drawn = new Map();
    player.tickets = [null, null, null, null];
    player.ticketSold = [true, true, true, true];
    slots.forEach((id, i) => {
      const used = drawn.get(id) || new Set();
      const tier = this.drawTicketTier(level, used);
      used.add(tier);
      drawn.set(id, used);
      player.tickets[i] = id * 100 + tier;
      player.ticketSold[i] = false;
    });
    return { ok: true };
  }

  ticketSlotCount() {
    return this.rogue ? Math.min(4, this.activeMascots.length + 1) : 4;
  }

  spellPool(p) {
    const level = this.playerLevel(p);
    return SPELLS
      .map((s) => ({ value: s.id, weight: SPELL_TYPE_WEIGHTS[s.type][level - 1] }))
      .filter((e) => {
        if (e.weight <= 0) return false;
        const s = spellById(e.value);
        // Opponent-targeting spells are useless in solo mode; keep them out of
        // the draw (the prototype offered them but refused the cast). Freeze
        // is likewise pointless solo — it only stops your own collections.
        if (this.mode === 1 && (s.targetsOpponent || s.type === SPELL_TYPES.FREEZE)) return false;
        // Roguelike: no spells for mascots that aren't in the game yet.
        if (!this.isActive(s.mascotId)) return false;
        // A direction spell that matches an active alert is redundant — e.g.
        // "Flixy can only move Up" during a Flixy Oil Strike.
        const alert = this.news.find((a) => a.mascotId === s.mascotId);
        if (alert && (
          (s.type === SPELL_TYPES.UP && alert.direction === 1) ||
          (s.type === SPELL_TYPES.DOWN && alert.direction === -1)
        )) return false;
        return true;
      });
  }

  // Roguelike: spells unlock with roster size — none with one mascot, one
  // slot with two, both slots from three on. Normal play always has both.
  spellSlotCount() {
    return this.rogue ? Math.min(2, Math.max(0, this.activeMascots.length - 1)) : 2;
  }

  refreshSpells(p) {
    const player = this.players[p];
    const pool = this.spellPool(p);
    const slots = this.spellSlotCount();
    player.spells = [null, null];
    player.spellSold = [true, true];
    if (!pool.length || slots === 0) return;
    const first = weightedPick(this.rng, pool);
    player.spells[0] = first;
    player.spellSold[0] = false;
    if (slots < 2) return;
    let second = weightedPick(this.rng, pool);
    // VBA RefreshSpell: the two offers must differ — when the pool has more
    // than one option (a lone-mascot roguelike round at level 1 may not).
    if (new Set(pool.map((e) => e.value)).size > 1) {
      while (second === first) second = weightedPick(this.rng, pool);
    }
    player.spells[1] = second;
    player.spellSold[1] = false;
  }

  // --- Betting -----------------------------------------------------------

  buyTicket(p, slot) {
    const player = this.players[p];
    if (this.over) return { ok: false, reason: 'Game is over' };
    if (!player.tickets[slot]) return { ok: false, reason: 'That ticket slot is locked' };
    if (player.ticketSold[slot]) return { ok: false, reason: 'Already bought this Bet this round' };
    const ticket = ticketById(player.tickets[slot]);
    if (player.coins < ticket.cost) return { ok: false, reason: 'Not enough Dollars to make this Bet' };
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
    if (!player.spells[slot]) return { ok: false, reason: 'No Spell in that slot' };
    if (player.spellSold[slot]) return { ok: false, reason: 'Already bought this Spell this round' };
    const spell = spellById(player.spells[slot]);
    if (player.ep < spell.cost) return { ok: false, reason: 'Not enough Gold to buy this Spell' };

    if (spell.needsTarget) {
      const targets = this.spellTargets(p, slot);
      if (targets.length === 0) {
        return { ok: false, reason: `No Gold on any Steps for ${mascotById(spell.mascotId).name}` };
      }
      if (!targets.includes(targetStep)) {
        return { ok: false, reason: 'That Step has no Gold, pick another please' };
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
    if (this.over || this.pendingChoice) return [];
    const events = [];
    this.round += 1;

    for (const mascot of this.activeList()) {
      const from = this.steps[mascot.id];
      const flag = this.flags[mascot.id]; // captured before the roll consumes it
      const rollValue = this.rollForMascot(mascot);
      const to = clamp(from + rollValue);
      this.steps[mascot.id] = to;
      this.lastRolls[mascot.id] = rollValue;
      this.lastFrom[mascot.id] = from;
      this.rolledOnce[mascot.id] = true;
      this.history[mascot.id].push(to);
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
      // News first, so the fresh shop can exclude alert-redundant spells.
      this.updateNews(events);
      for (let p = 0; p < this.players.length; p++) {
        this.refreshTickets(p, { free: true });
        this.refreshSpells(p);
      }
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
    if (this.rogue) {
      const target = ROGUE.targets[this.round];
      if (target !== undefined) {
        const ep = this.players[0].ep;
        const passed = ep >= target;
        const final = this.round === ROGUE.rounds;
        events.push({ type: 'checkpoint', round: this.round, target, ep, passed, final });
        if (!passed) {
          this.over = true;
          this.winner = false;
          this.failedCheckpoint = { round: this.round, target };
        } else {
          if (final) {
            this.over = true;
            this.winner = true;
          } else if (this.activeMascots.length < MASCOTS_PER_GAME) {
            this.pendingChoice = this.pickChoice(); // a new mascot joins the run
          }
          // Stretch-score Coin bonus, granted here — before incrementCoins —
          // so it counts toward this round's interest.
          const bonus = ROGUE.bonuses[this.round];
          if (bonus && !this.over && ep >= bonus.over) {
            this.players[0].coins += bonus.coins;
            events.push({ type: 'bonus', round: this.round, coins: bonus.coins, threshold: bonus.over, ep });
          }
        }
      }
      return;
    }
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
    if (!this.isActive(row.mascotId)) return; // roguelike: benched mascots make no news
    if (this.news.some((a) => a.mascotId === row.mascotId)) return; // wasted draw
    this.news.push({ mascotId: row.mascotId, direction: row.direction, newsType: row.newsType, count: 1 });
    this.flags[row.mascotId] = row.direction;
    events.push({
      type: 'news',
      mascotId: row.mascotId,
      direction: row.direction,
      newsType: row.newsType,
      message: `Mascot News — ${row.newsType}! ${mascotById(row.mascotId).name} can only move ${row.direction > 0 ? 'Up' : 'Down'} ${
        this.alertOutlastsGame() ? 'until the game ends' : `for the next ${CONFIG.newsDurationRolls} rolls`}.`,
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
