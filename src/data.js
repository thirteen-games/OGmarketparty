// Market Party — game data
// Extracted from "MP Proto V1.0 for Claude.xlsm" (Roll and Mascots, Betting Tickets,
// Spell Pool sheets and VBA Module6/Module9). Values are verbatim from the prototype.

export const BOARD_MIN = 0;
export const BOARD_MAX = 100;
export const START_STEP = 50;

export const CONFIG = {
  startingCoins: 10,       // raised from the prototype's 7 (Game simulation DO31)
  coinsPerRound: 7,        // Game simulation DO32
  interestDivisor: 5,      // GameSimIncrementCoins: floor(coins/5)
  maxInterest: 5,          // capped at 5
  refreshCostFirst: 1,     // first manual shop refresh each round
  refreshCostNext: 2,      // every refresh after that (prototype charged a flat 2)
  onePlayerRounds: 10,     // IsGameOver: P1Rounds
  onePlayerGoal: 1000,     // IsGameOver: GameTo1
  twoPlayerGoal: 1000,     // IsGameOver: GameTo2
  newsDurationRolls: 3,    // MascotNews counter runs 1..3
};

// Roguelike mode: checkpoint EP targets by round (miss one and the run ends),
// plus the victory target after the final round. Early gates also carry a
// Coin bonus for beating a stretch score, granted BEFORE income/interest so
// it compounds. Tuned by simulation across four player archetypes
// (max-spend / saver / half-spend / hybrid) to win rates within 3 points.
export const ROGUE = {
  rounds: 15,
  targets: { 3: 40, 6: 225, 9: 500, 12: 1000, 15: 1500 },
  bonuses: { 3: { over: 80, coins: 7 }, 6: { over: 400, coins: 7 } },
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
    rolls: [-8, -6, -4, -2, 2, 3, 3, 4, 4, 8],
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
  {
    id: 5,
    name: 'Lev',
    sector: 'Entertainment',
    className: 'Diver',
    // Leans down, but surges hard when he swims up (40% up, avg swing 5.6).
    rolls: [10, 8, 5, 3, -2, -3, -4, -5, -7, -9],
    color: '#2b7fc2', // ocean-blue lane
    epMoveSteps: 6,
  },
  {
    id: 6,
    name: 'Joey',
    sector: 'Entertainment',
    className: 'Jumper',
    // Grinds down most rolls, then leaps: 40% up averaging +6.5 (never less
    // than +6), 60% down averaging -4. Slight +0.2 drift, avg |move| 5.0.
    rolls: [7, 7, 6, 6, -3, -3, -3, -5, -5, -5],
    color: '#8b5a2b', // kangaroo-brown lane
    epMoveSteps: 5,
  },
];

// Games field 4 mascots at a time: all four in the prototype's classic modes
// (chosen randomly from the roster of 5), drafted one at a time in roguelike.
export const MASCOTS_PER_GAME = 4;

// Betting tickets (Betting Tickets Table797, S28:AJ51).
// id = mascotId*100 + tier. target offsets are relative to the mascot's step
// at purchase time; tickets with target2 place the reward on BOTH steps.
// `difficulty` is the designer's original hand-written label, kept for
// reference only — the game now computes live odds instead (see odds.js).
export const TICKETS = [
  { id: 101, mascotId: 1, rarity: 'Common',    difficulty: 'Medium',    cost: 1,  reward: 12,  target1: 1,  target2: null },
  { id: 201, mascotId: 2, rarity: 'Common',    difficulty: 'Medium',    cost: 1,  reward: 13,  target1: -1, target2: null },
  { id: 301, mascotId: 3, rarity: 'Common',    difficulty: 'Very Hard', cost: 1,  reward: 28,  target1: -1, target2: null },
  { id: 401, mascotId: 4, rarity: 'Common',    difficulty: 'Medium',    cost: 1,  reward: 11,  target1: 1,  target2: null },
  { id: 102, mascotId: 1, rarity: 'Common',    difficulty: 'Medium',    cost: 2,  reward: 26,  target1: -1, target2: null },
  { id: 202, mascotId: 2, rarity: 'Common',    difficulty: 'Medium',    cost: 2,  reward: 24,  target1: 1,  target2: null },
  { id: 302, mascotId: 3, rarity: 'Common',    difficulty: 'Very Easy', cost: 2,  reward: 20,  target1: 1,  target2: null },
  { id: 402, mascotId: 4, rarity: 'Common',    difficulty: 'Medium',    cost: 2,  reward: 29,  target1: -1, target2: null },
  { id: 103, mascotId: 1, rarity: 'Rare',      difficulty: 'Hard',      cost: 3,  reward: 52,  target1: -2, target2: null },
  { id: 203, mascotId: 2, rarity: 'Rare',      difficulty: 'Medium',    cost: 3,  reward: 48,  target1: 5,  target2: null },
  { id: 303, mascotId: 3, rarity: 'Rare',      difficulty: 'Medium',    cost: 3,  reward: 36,  target1: 2,  target2: null },
  { id: 403, mascotId: 4, rarity: 'Rare',      difficulty: 'Medium',    cost: 3,  reward: 56,  target1: -3, target2: null },
  { id: 104, mascotId: 1, rarity: 'Super Rare', difficulty: 'Very Hard', cost: 4,  reward: 78,  target1: 2,  target2: null },
  { id: 204, mascotId: 2, rarity: 'Super Rare', difficulty: 'Very Easy', cost: 4,  reward: 77,  target1: -4, target2: null },
  { id: 304, mascotId: 3, rarity: 'Super Rare', difficulty: 'Easy',      cost: 4,  reward: 69,  target1: 3,  target2: null },
  { id: 404, mascotId: 4, rarity: 'Super Rare', difficulty: 'Medium',    cost: 4,  reward: 71,  target1: 4,  target2: null },
  { id: 105, mascotId: 1, rarity: 'Epic',      difficulty: 'Easy',      cost: 5,  reward: 95,  target1: 4,  target2: -4 },
  { id: 205, mascotId: 2, rarity: 'Epic',      difficulty: 'Medium',    cost: 5,  reward: 85,  target1: 10, target2: -8 },
  { id: 305, mascotId: 3, rarity: 'Epic',      difficulty: 'Very Easy', cost: 5,  reward: 72,  target1: 2,  target2: -2 },
  { id: 405, mascotId: 4, rarity: 'Epic',      difficulty: 'Easy',      cost: 5,  reward: 85,  target1: 7,  target2: -6 },
  // Lev's tickets: rewards priced so each tier's expected EP matches the
  // average of the other mascots' tickets at that tier (4-roll odds).
  { id: 501, mascotId: 5, rarity: 'Common',    difficulty: 'Very Easy', cost: 1,  reward: 11,  target1: -1, target2: null },
  { id: 502, mascotId: 5, rarity: 'Common',    difficulty: 'Easy',      cost: 2,  reward: 28,  target1: 1,  target2: null },
  { id: 503, mascotId: 5, rarity: 'Rare',      difficulty: 'Easy',      cost: 3,  reward: 49,  target1: -5, target2: null },
  { id: 504, mascotId: 5, rarity: 'Super Rare', difficulty: 'Medium',    cost: 4,  reward: 88, target1: 5,  target2: null },
  { id: 505, mascotId: 5, rarity: 'Epic',      difficulty: 'Easy',      cost: 5,  reward: 80,  target1: 8,  target2: -8 },
  { id: 510, mascotId: 5, rarity: 'Legendary', difficulty: 'Hard',      cost: 10, reward: 205, target1: 7,  target2: -9 },
  // Joey's tickets: parity-priced on the ratio curve from his die's 4-roll
  // odds (balance-sim pipeline). Legendary +7/-6 rounded up from parity 195
  // to hold the 200 floor.
  { id: 601, mascotId: 6, rarity: 'Common',    difficulty: 'Easy',      cost: 1,  reward: 12,  target1: -2, target2: null },
  { id: 602, mascotId: 6, rarity: 'Common',    difficulty: 'Easy',      cost: 2,  reward: 26,  target1: 1,  target2: null },
  { id: 603, mascotId: 6, rarity: 'Rare',      difficulty: 'Easy',      cost: 3,  reward: 53,  target1: -5, target2: null },
  { id: 604, mascotId: 6, rarity: 'Super Rare', difficulty: 'Medium',    cost: 4,  reward: 83,  target1: 6,  target2: null },
  { id: 605, mascotId: 6, rarity: 'Epic',      difficulty: 'Very Easy', cost: 5,  reward: 81,  target1: 9,  target2: -5 },
  { id: 610, mascotId: 6, rarity: 'Legendary', difficulty: 'Hard',      cost: 10, reward: 200, target1: 7,  target2: -6 },
  { id: 110, mascotId: 1, rarity: 'Legendary', difficulty: 'Hard',      cost: 10, reward: 200, target1: 3,  target2: -3 },
  { id: 210, mascotId: 2, rarity: 'Legendary', difficulty: 'Hard',      cost: 10, reward: 247, target1: 11, target2: -9 },
  { id: 310, mascotId: 3, rarity: 'Legendary', difficulty: 'Hard',      cost: 10, reward: 219, target1: 4,  target2: -1 },
  { id: 410, mascotId: 4, rarity: 'Legendary', difficulty: 'Hard',      cost: 10, reward: 212, target1: 8,  target2: -5 },
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

// Payout multiplier by ticket cost (from the prototype's "Drop Rates and
// more info" Stats Geek box). Informational: higher-cost tickets pay
// proportionally more EP per coin.
export const PAYOUT_RATIOS = { 1: 1.0, 2: 1.1, 3: 1.2, 4: 1.35, 5: 1.7, 10: 2.1 };

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
  151: 10, 251: 10, 351: 10, 451: 10, 551: 10, 651: 10,
  152: 20, 252: 20, 352: 20, 452: 20, 552: 20, 652: 20,
  153: 15, 253: 15, 353: 15, 453: 15, 553: 15, 653: 15,
  154: 50, 254: 50, 354: 50, 454: 50, 554: 50, 654: 50,
  // Up-only is a huge swing for a mascot that rarely rises — price it high.
  // (Joey's forced up is a guaranteed +6 or +7 — nearly as strong as Lev's.)
  155: 25, 255: 20, 355: 10, 455: 20, 555: 30, 655: 30,
  156: 25, 256: 30, 356: 30, 456: 30, 556: 10, 656: 25,
  157: 20, 257: 20, 357: 20, 457: 20, 557: 20, 657: 20,
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
    case 51: return `Double Gold (up to +50) on one ${mascot.name} Step`;
    case 52: return `Halve Gold (up to -50) on one opponent ${mascot.name} Step`;
    case 53: return `Move Gold ${mascot.epMoveSteps} Steps closer to ${mascot.name}`;
    case 54: return `Steal up to 50 Gold from one opponent ${mascot.name} Step`;
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

// Mascot News alerts. One draw per round (including one before round 1):
// each row's weight is its percent chance; the remainder (35%) is no alert.
// Oil Strike = up-only, Earthquake = down-only, each lasting 3 rolls.
// Each mascot can only have one alert — a draw for an already-alerted mascot
// is wasted. (With one draw per round and 3-roll durations, at most 3 alerts
// can overlap naturally.)
export const NEWS_TABLE = [
  { mascotId: 1, direction: 1,  weight: 8,  newsType: 'Oil Strike' },
  { mascotId: 2, direction: 1,  weight: 10, newsType: 'Oil Strike' },
  { mascotId: 3, direction: 1,  weight: 5,  newsType: 'Oil Strike' },
  { mascotId: 4, direction: 1,  weight: 12, newsType: 'Oil Strike' },
  { mascotId: 1, direction: -1, weight: 8,  newsType: 'Earthquake' },
  { mascotId: 2, direction: -1, weight: 7,  newsType: 'Earthquake' },
  { mascotId: 3, direction: -1, weight: 5,  newsType: 'Earthquake' },
  { mascotId: 4, direction: -1, weight: 10, newsType: 'Earthquake' },
  // Lev's rows: draws for mascots not in the current game are suppressed, so
  // with 4 of 5 mascots fielded the effective alert rate stays near 65%.
  { mascotId: 5, direction: 1,  weight: 8,  newsType: 'Oil Strike' },
  { mascotId: 5, direction: -1, weight: 7,  newsType: 'Earthquake' },
  { mascotId: 6, direction: 1,  weight: 8,  newsType: 'Oil Strike' },
  { mascotId: 6, direction: -1, weight: 7,  newsType: 'Earthquake' },
];
export const NEWS_EMOJI = { 'Oil Strike': '🛢️', Earthquake: '🌍' };

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
