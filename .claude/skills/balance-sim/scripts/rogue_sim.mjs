// Roguelike calibration sim: four coin-strategy archetypes play full runs
// with real behavior (alert-aware EV shopping, sensible spells, real gates,
// bonuses). Outputs the survival/win chart and average EP per mark.
//
//   node rogue_sim.mjs [--runs 400]
//       [--gates 40,225,500,1000,1500]        override ROGUE.targets (R3,R6,R9,R12,R15)
//       [--bonus3 80] [--bonus6 400]          override bonus thresholds (0 disables)
//       [--no-gates]                          distribution mode: gates off, report
//                                             score percentiles at each mark instead
import { data, ARCHETYPES, playRogueRun } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const N = Number(opt('runs', 400));
const marks = [3, 6, 9, 12, 15];

const gates = opt('gates', null);
if (gates) {
  const [g3, g6, g9, g12, g15] = gates.split(',').map(Number);
  Object.assign(data.ROGUE.targets, { 3: g3, 6: g6, 9: g9, 12: g12, 15: g15 });
}
if (args.includes('--no-gates')) for (const k of Object.keys(data.ROGUE.targets)) data.ROGUE.targets[k] = 0;
const b3 = opt('bonus3', null);
const b6 = opt('bonus6', null);
if (b3 !== null) { if (Number(b3) === 0) delete data.ROGUE.bonuses[3]; else data.ROGUE.bonuses[3].over = Number(b3); }
if (b6 !== null) { if (Number(b6) === 0) delete data.ROGUE.bonuses[6]; else data.ROGUE.bonuses[6].over = Number(b6); }

console.log(`runs: ${N} | gates: ${JSON.stringify(data.ROGUE.targets)} | bonuses: ${JSON.stringify(data.ROGUE.bonuses)}\n`);

const table = {};
for (const [name, act] of Object.entries(ARCHETYPES)) {
  const alive = Object.fromEntries(marks.map((m) => [m, 0]));
  const scores = Object.fromEntries(marks.map((m) => [m, []]));
  let wins = 0;
  const bonusCount = { 3: 0, 6: 0 };
  for (let seed = 0; seed < N; seed++) {
    const run = playRogueRun(seed, act, marks);
    for (const m of marks) {
      if (run.atMark[m] !== undefined) {
        scores[m].push(run.atMark[m]);
        if (run.aliveAt[m]) alive[m]++;
      }
    }
    if (run.won) wins++;
    for (const r of run.bonuses) if (bonusCount[r] !== undefined) bonusCount[r]++;
  }
  table[name] = { alive, scores, wins, bonusCount };
}

const names = Object.keys(table);
const pct = (x) => (x * 100).toFixed(0) + '%';
if (args.includes('--no-gates')) {
  console.log('score percentiles at each mark (gates off):');
  const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
  for (const name of names) {
    console.log('== ' + name);
    for (const m of marks) {
      const a = table[name].scores[m];
      console.log(`  R${String(m).padStart(2)}: p10 ${q(a, 0.1)} | p25 ${q(a, 0.25)} | p50 ${q(a, 0.5)} | p75 ${q(a, 0.75)} | p90 ${q(a, 0.9)}`);
    }
  }
} else {
  console.log('SURVIVAL through each gate (% of runs):');
  console.log('gate (target)   |', names.map((n) => n.padStart(14)).join(' |'));
  for (const m of marks) {
    console.log(
      `R${m} (${data.ROGUE.targets[m]})`.padEnd(15), '|',
      names.map((n) => pct(table[n].alive[m] / N).padStart(14)).join(' |'),
    );
  }
  console.log('WIN rate'.padEnd(15), '|', names.map((n) => pct(table[n].wins / N).padStart(14)).join(' |'));
  for (const r of [3, 6]) {
    if (!data.ROGUE.bonuses[r]) continue;
    console.log(`bonus @R${r} >${data.ROGUE.bonuses[r].over}`.padEnd(15), '|',
      names.map((n) => pct(table[n].bonusCount[r] / N).padStart(14)).join(' |'));
  }
}
console.log('\navg EP at each mark (runs that reached it):');
for (const m of marks) {
  console.log(`R${m}`.padEnd(15), '|', names.map((n) => {
    const a = table[n].scores[m];
    return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0).padStart(14) : 'n/a'.padStart(14);
  }).join(' |'));
}
