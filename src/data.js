// Market Party — game data
// Extracted from "MP Proto V1.0 for Claude.xlsm" (Roll and Mascots, Betting Tickets,
// Spell Pool sheets and VBA Module6/Module9). Values are verbatim from the prototype.

export const BOARD_MIN = 0;
export const BOARD_MAX = 100;
export const START_STEP = 50;

export const CONFIG = {
  startingCoins: 7,        // Game simulation DO31
  coinsPerRound: 7,        // Game simulation DO32
  interestDivisor: 5,      // GameSimIncrementCoins: floor(coins/5)
  maxInterest: 5,          // capped at 5
  refreshCost: 2,          // GameSimRefreshAndPayCoins
  onePlayerRounds: 10,     // IsGameOver: P1Rounds
  onePlayerGoal: 1000,     // IsGameOver: GameTo1
  twoPlayerGoal: 1000,     // IsGameOver: GameTo2
  newsDurationRolls: 3,    // MascotNews counter runs 1..3
};

// EP level thresholds (Game simulation DN11:DO15). Level = highest row <= banked EP.
export const EP_LEVELS = [
  { level: 1, minEP: 0 },
  { level: 2, minEP: 30 },
  { level: 3, minEP: 80 },
  { level: 4, minEP: 200 },
  { level: 5, minEP: 500 },
];

export const MASCOTS = [
  {
    id: 1,
    name: 'Mousey',
    sector: 'Entertainment',
    className: 'Giant',
    // 10 equally likely rolls (Roll and Mascots AC6:AL6)
    rolls: [-4, -3, -2, -1, -1, 1, 1, 2, 3, 4],
    color: '#7a3fa8', // purple lane, matching the prototype board
    epMoveSteps: 2, // BuySpell: RewardMoveSteps
  },
  {
    id: 3,
    name: 'Wolf',
    sector: 'Entertainment',
    className: 'Grower',
    rolls: [-2, -1, 1, 1, 1, 1, 1, 1, 2, 2],
    color: '#c8960c', // gold lane
    epMoveSteps: 2,
  },
  {
    id: 4,
    name: 'Flixy',
    sector: 'Entertainment',
    className: 'Flyer',
    rolls: [-8, -6, -4, -2, 2, 2, 3, 4, 4, 8],
    color: '#6e7681', // gray lane
    epMoveSteps: 4,
  },
  {
    id: 2,
    name: 'Bizarro',
    sector: 'Entertainment',
    className: 'Crazy',
    rolls: [-10, -8, -6, -4, 2, 3, 4, 6, 8, 10],
    color: '#d63430', // red lane
    epMoveSteps: 6,
  },
];

// Betting tickets (Betting Tickets Table797, S28:AJ51).
// id = mascotId*100 + tier. target offsets are relative to the mascot's step
// at purchase time; tickets with target2 place the reward on BOTH steps.
// `difficulty` is the designer's original hand-written label, kept for
// reference only — the game now computes live odds instead (see odds.js).
export const TICKETS = [
  { id: 101, mascotId: 1, rarity: 'Common',    difficulty: 'Medium',    cost: 1,  reward: 11,  target1: 1,  target2: null },
  { id: 201, mascotId: 2, rarity: 'Common',    difficulty: 'Medium',    cost: 1,  reward: 12,  target1: -1, target2: null },
  { id: 301, mascotId: 3, rarity: 'Common',    difficulty: 'Very Hard', cost: 1,  reward: 34,  target1: -1, target2: null },
  { id: 401, mascotId: 4, rarity: 'Common',    difficulty: 'Medium',    cost: 1,  reward: 10,  target1: 1,  target2: null },
  { id: 102, mascotId: 1, rarity: 'Common',    difficulty: 'Medium',    cost: 2,  reward: 24,  target1: -1, target2: null },
  { id: 202, mascotId: 2, rarity: 'Common',    difficulty: 'Medium',    cost: 2,  reward: 21,  target1: 1,  target2: null },
  { id: 302, mascotId: 3, rarity: 'Common',    difficulty: 'Very Easy', cost: 2,  reward: 17,  target1: 1,  target2: null },
  { id: 402, mascotId: 4, rarity: 'Common',    difficulty: 'Medium',    cost: 2,  reward: 24,  target1: -1, target2: null },
  { id: 103, mascotId: 1, rarity: 'Rare',      difficulty: 'Hard',      cost: 3,  reward: 50,  target1: -2, target2: null },
  { id: 203, mascotId: 2, rarity: 'Rare',      difficulty: 'Medium',    cost: 3,  reward: 47,  target1: 5,  target2: null },
  { id: 303, mascotId: 3, rarity: 'Rare',      difficulty: 'Medium',    cost: 3,  reward: 32,  target1: 2,  target2: null },
  { id: 403, mascotId: 4, rarity: 'Rare',      difficulty: 'Medium',    cost: 3,  reward: 52,  target1: -3, target2: null },
  { id: 104, mascotId: 1, rarity: 'Epic',      difficulty: 'Very Hard', cost: 4,  reward: 80,  target1: 2,  target2: null },
  { id: 204, mascotId: 2, rarity: 'Epic',      difficulty: 'Very Easy', cost: 4,  reward: 80,  target1: -4, target2: null },
  { id: 304, mascotId: 3, rarity: 'Epic',      difficulty: 'Easy',      cost: 4,  reward: 60,  target1: 3,  target2: null },
  { id: 404, mascotId: 4, rarity: 'Epic',      difficulty: 'Medium',    cost: 4,  reward: 75,  target1: 4,  target2: null },
  { id: 105, mascotId: 1, rarity: 'Epic',      difficulty: 'Easy',      cost: 5,  reward: 95,  target1: 4,  target2: -4 },
  { id: 205, mascotId: 2, rarity: 'Epic',      difficulty: 'Medium',    cost: 5,  reward: 85,  target1: 10, target2: -8 },
  { id: 305, mascotId: 3, rarity: 'Epic',      difficulty: 'Easy',      cost: 5,  reward: 80,  target1: 4,  target2: -1 },
  { id: 405, mascotId: 4, rarity: 'Epic',      difficulty: 'Easy',      cost: 5,  reward: 85,  target1: 7,  target2: -6 },
  { id: 110, mascotId: 1, rarity: 'Legendary', difficulty: 'Medium',    cost: 10, reward: 150, target1: 3,  target2: -3 },
  { id: 210, mascotId: 2, rarity: 'Legendary', difficulty: 'Medium',    cost: 10, reward: 140, target1: 8,  target2: -6 },
  { id: 310, mascotId: 3, rarity: 'Legendary', difficulty: 'Medium',    cost: 10, reward: 120, target1: 2,  target2: -1 },
  { id: 410, mascotId: 4, rarity: 'Legendary', difficulty: 'Easy',      cost: 10, reward: 145, target1: 6,  target2: -3 },
];

// Ticket tier drop weights per EP level (Betting Tickets G8:O31; identical for
// every mascot, so weights are stored once per tier). The shop draws a tier
// independently for each mascot, then offers ticket mascotId*100 + tier.
export const TICKET_TIER_WEIGHTS = {
  //        L1  L2  L3  L4  L5
  1:  [43, 30, 20, 15, 15],
  2:  [33, 25, 20, 15, 15],
  3:  [16, 20, 20, 20, 15],
  4:  [6,  15, 20, 20, 15],
  5:  [3,  10, 15, 20, 15],
  10: [0,  0,  5,  10, 25],
};

// Spells (Game simulation Table9, BG10:BK41). id = mascotId*100 + (50 + type).
// type: 1 double, 2 halve (opponent), 3 move closer, 4 steal (opponent),
//       5 up-only next roll, 6 down-only next roll, 7 freeze next roll.
export const SPELL_TYPES = {
  DOUBLE: 51,
  HALVE: 52,
  MOVE: 53,
  STEAL: 54,
  UP: 55,
  DOWN: 56,
  FREEZE: 57,
};

// Per-spell costs (Table9 BK column).
const SPELL_COSTS = {
  151: 10, 251: 10, 351: 10, 451: 10,
  152: 20, 252: 20, 352: 20, 452: 20,
  153: 15, 253: 15, 353: 15, 453: 15,
  154: 50, 254: 50, 354: 50, 454: 50,
  155: 25, 255: 20, 355: 10, 455: 20,
  156: 25, 256: 30, 356: 30, 456: 30,
  157: 20, 257: 20, 357: 20, 457: 20,
};

export const SPELLS = [];
for (const mascot of MASCOTS) {
  for (const type of [51, 52, 53, 54, 55, 56, 57]) {
    const id = mascot.id * 100 + type;
    SPELLS.push({
      id,
      mascotId: mascot.id,
      type,
      cost: SPELL_COSTS[id],
      description: spellDescription(type, mascot),
      needsTarget: type <= 54,
      targetsOpponent: type === 52 || type === 54,
    });
  }
}

function spellDescription(type, mascot) {
  switch (type) {
    case 51: return `Double EP (up to +50) on one ${mascot.name} Step`;
    case 52: return `Halve EP (up to -50) on one opponent ${mascot.name} Step`;
    case 53: return `Move EP ${mascot.epMoveSteps} Steps closer to ${mascot.name}`;
    case 54: return `Steal up to 50 EP from one opponent ${mascot.name} Step`;
    case 55: return `${mascot.name} can only move Up on the next roll`;
    case 56: return `${mascot.name} can only move Down on the next roll`;
    case 57: return `Freeze ${mascot.name} for one round`;
  }
}

// Spell drop weights per spell type per EP level (Spell Pool G8:O39; identical
// across mascots).
export const SPELL_TYPE_WEIGHTS = {
  //          L1   L2  L3  L4  L5
  51: [100, 40, 30, 20, 0],
  52: [0,   20, 30, 20, 25],
  53: [0,   40, 20, 20, 0],
  54: [0,   0,  20, 20, 20],
  55: [0,   0,  0,  10, 25],
  56: [0,   0,  0,  10, 25],
  57: [0,   0,  0,  0,  5],
};

// Mascot News (VBA MascotNews): each round, if no news is active, draw r in
// [0,1) and compare against these thresholds in order. direction 1 = up-only,
// -1 = down-only for the next 3 rolls.
export const NEWS_TABLE = [
  { threshold: 0.95, mascotId: 1, direction: 1 },
  { threshold: 0.89, mascotId: 2, direction: 1 },
  { threshold: 0.81, mascotId: 3, direction: 1 },
  { threshold: 0.75, mascotId: 4, direction: 1 },
  { threshold: 0.70, mascotId: 1, direction: -1 },
  { threshold: 0.66, mascotId: 2, direction: -1 },
  { threshold: 0.64, mascotId: 3, direction: -1 },
  { threshold: 0.60, mascotId: 4, direction: -1 },
];

export function mascotById(id) {
  return MASCOTS.find((m) => m.id === id);
}

export function ticketById(id) {
  return TICKETS.find((t) => t.id === id);
}

export function spellById(id) {
  return SPELLS.find((s) => s.id === id);
}

export function epLevelFor(ep) {
  let level = 1;
  for (const row of EP_LEVELS) {
    if (ep >= row.minEP) level = row.level;
  }
  return level;
}
