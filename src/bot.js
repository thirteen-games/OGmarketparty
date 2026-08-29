// Bot opponent for vs-Bot mode. The bot plays as player index 1 and takes its
// whole turn (refresh, bets, spells) right before the roll. All choices go
// through the engine's public actions, so a bot can never cheat.

import { CONFIG, MASCOTS, SPELL_TYPES, mascotById, ticketById, spellById } from './data.js';
import { collectProbability } from './odds.js';

const P = 1; // the bot's player index

export const BOT_LEVELS = {
  easy: { name: 'Rookie Randy', emoji: '🐣', blurb: 'bets on vibes' },
  medium: { name: 'Billy Bull', emoji: '🐂', blurb: 'plays the odds' },
  hard: { name: 'Baldy Bear', emoji: '🐻', blurb: 'ruthless value investor' },
};

export function botName(level) {
  const b = BOT_LEVELS[level];
  return `${b.emoji} ${b.name}`;
}

// Take the bot's full turn. Returns log lines describing what it did.
export function botTakeTurn(game, level) {
  if (game.over) return [];
  return level === 'easy' ? easyTurn(game) : valueTurn(game, level === 'hard');
}

// No bot, however dim, buys a ticket whose every target points the wrong way
// during an active alert (e.g. an Up bounty while the mascot is Down-only).
function badUnderAlert(game, ticket) {
  const alert = game.news.find((a) => a.mascotId === ticket.mascotId);
  if (!alert) return false;
  return [ticket.target1, ticket.target2]
    .filter((o) => o !== null)
    .every((o) => Math.sign(o) !== alert.direction);
}

// --- Easy: random shopper -----------------------------------------------------

function easyTurn(game) {
  const actions = [];
  const bot = game.players[P];
  for (let slot = 0; slot < 4; slot++) {
    if (game.rng() < 0.55) {
      const t = ticketById(bot.tickets[slot]);
      if (badUnderAlert(game, t)) continue;
      if (game.buyTicket(P, slot).ok) {
        actions.push(`bet 🪙${t.cost} on ${mascotById(t.mascotId).name}.`);
      }
    }
  }
  for (let slot = 0; slot < 2; slot++) {
    if (!bot.spells[slot]) continue;
    if (game.rng() >= 0.35) continue;
    const spell = spellById(bot.spells[slot]);
    if (bot.ep < spell.cost) continue;
    let target = null;
    if (spell.needsTarget) {
      const targets = game.spellTargets(P, slot);
      if (!targets.length) continue;
      target = targets[Math.floor(game.rng() * targets.length)];
    }
    if (game.castSpell(P, slot, target).ok) actions.push(`cast: ${spell.description}`);
  }
  return actions;
}

// --- Medium / Hard: expected-value play ----------------------------------------

function valueTurn(game, hard) {
  const actions = [];
  const bot = game.players[P];
  const horizon = game.oddsHorizon();

  // Hard bots respect active alerts when judging odds; medium bots don't.
  const constraintFor = (mascotId) => {
    if (!hard) return null;
    const a = game.news.find((x) => x.mascotId === mascotId);
    return a ? { direction: a.direction, rolls: CONFIG.newsDurationRolls - a.count + 1 } : null;
  };

  // Expected EP from a ticket: each target pays independently.
  const evOf = (ticketId) => {
    const t = ticketById(ticketId);
    const m = mascotById(t.mascotId);
    const c = constraintFor(t.mascotId);
    return [t.target1, t.target2]
      .filter((o) => o !== null)
      .reduce((s, o) => s + collectProbability(m, [o], horizon, c) * t.reward, 0);
  };

  // Hard: refresh a weak shop once (first refresh is cheap).
  if (hard && !bot.ticketSold.some(Boolean)) {
    const bestPerCoin = Math.max(...bot.tickets.map((id) => evOf(id) / ticketById(id).cost));
    const cost = game.refreshCost(P);
    if (bestPerCoin < 3 && bot.coins > cost + 3 && game.refreshTickets(P).ok) {
      actions.push(`refreshed the shop for 🪙${cost}.`);
    }
  }

  // Buy the best EP-per-coin tickets above a quality bar.
  const bar = hard ? 3.5 : 3;
  const ranked = [0, 1, 2, 3]
    .map((slot) => {
      const t = ticketById(bot.tickets[slot]);
      return { slot, t, perCoin: evOf(t.id) / t.cost };
    })
    .sort((a, b) => b.perCoin - a.perCoin);
  for (const { slot, t, perCoin } of ranked) {
    if (perCoin < bar) break;
    if (badUnderAlert(game, t)) continue;
    if (bot.coins < t.cost) continue;
    if (game.buyTicket(P, slot).ok) {
      actions.push(`bet 🪙${t.cost} on ${mascotById(t.mascotId).name} (⭐${t.reward}).`);
    }
  }

  // Spells, only when the expected return beats the EP price.
  for (let slot = 0; slot < 2; slot++) {
    if (!bot.spells[slot]) continue;
    const spell = spellById(bot.spells[slot]);
    if (bot.spellSold[slot] || bot.ep < spell.cost) continue;
    const target = pickSpellPlay(game, spell, hard, horizon, constraintFor);
    if (target === undefined) continue;
    if (game.castSpell(P, slot, target).ok) actions.push(`cast: ${spell.description}`);
  }

  return actions;
}

// Decide whether to cast a spell and on what. Returns the target step,
// null for untargeted spells, or undefined to pass.
function pickSpellPlay(game, spell, hard, horizon, constraintFor) {
  const mascot = mascotById(spell.mascotId);
  const pos = game.steps[mascot.id];
  const c = constraintFor(mascot.id);
  const chipsOf = (playerIdx) =>
    Object.entries(game.players[playerIdx].board[mascot.id])
      .map(([s, ep]) => ({ step: Number(s), ep }))
      .filter((x) => x.ep > 0);
  const reachP = (step) => collectProbability(mascot, [step - pos], horizon, c);
  const biggest = (list) => list.reduce((a, b) => (b.ep > a.ep ? b : a), { ep: 0, step: null });

  switch (spell.type) {
    case SPELL_TYPES.DOUBLE: {
      const best = biggest(chipsOf(P));
      if (!best.step && best.step !== 0) return undefined;
      const gain = Math.min(best.ep, 50) * reachP(best.step);
      return gain > spell.cost * 1.2 ? best.step : undefined;
    }
    case SPELL_TYPES.MOVE: {
      // Instant profit: a chip within reach is collected on the spot.
      const instant = chipsOf(P).filter((x) => Math.abs(x.step - pos) <= mascot.epMoveSteps);
      const best = biggest(instant);
      return best.ep > spell.cost ? best.step : undefined;
    }
    case SPELL_TYPES.HALVE: {
      if (!hard) return undefined;
      const best = biggest(chipsOf(0));
      return best.ep >= 60 ? best.step : undefined;
    }
    case SPELL_TYPES.STEAL: {
      if (!hard) return undefined;
      const best = biggest(chipsOf(0));
      return best.ep >= 50 && reachP(best.step) >= 0.4 ? best.step : undefined;
    }
    case SPELL_TYPES.UP:
    case SPELL_TYPES.DOWN: {
      const dir = spell.type === SPELL_TYPES.UP ? 1 : -1;
      const net = chipsOf(P).reduce(
        (s, x) => s + Math.sign(x.step - pos) * dir * x.ep, 0);
      return net >= spell.cost * 2 ? null : undefined;
    }
    case SPELL_TYPES.FREEZE: {
      if (!hard) return undefined;
      // Freeze when the opponent has real EP right next to the mascot and we don't.
      const near = (playerIdx) =>
        chipsOf(playerIdx).filter((x) => Math.abs(x.step - pos) <= 2).reduce((s, x) => s + x.ep, 0);
      return near(0) >= 30 && near(0) > near(P) * 2 ? null : undefined;
    }
    default:
      return undefined;
  }
}
