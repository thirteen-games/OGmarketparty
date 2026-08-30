// Dual-target band analysis: payout odds, double-hit odds, and parity
// rewards for candidate ticket bands.
//
// Evaluate specific bands:
//   node band_analysis.mjs --bands "Mousey:+3/-3,Wolf:+4/-1" [--cost 10] [--ratio 2.1]
// Search a mascot's band space:
//   node band_analysis.mjs --search Mousey --min-reward 200 [--max-reward 260]
//       [--cost 10] [--ratio 2.1] [--by both|tight]   (both = max double odds,
//                                                      tight = max payout odds)
import {
  data, collectProbability, bothProbability, BASELINE_EP_PER_COIN, SHOP_WINDOW,
} from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};

const cost = Number(opt('cost', 10));
const ratio = Number(opt('ratio', data.PAYOUT_RATIOS[cost] ?? 2.1));
const EV = BASELINE_EP_PER_COIN * cost * ratio;
const row = (m, up, down) => {
  const sum = collectProbability(m, [up], SHOP_WINDOW) + collectProbability(m, [down], SHOP_WINDOW);
  return { up, down, sum, reward: Math.round(EV / sum), both: bothProbability(m, up, down, 5) };
};
const print = (name, r) => console.log(
  name.padEnd(8), ('+' + r.up + '/' + r.down).padEnd(9),
  '| reward', String(r.reward).padStart(4),
  '| either@4', (r.sum * 100).toFixed(0).padStart(3) + '%',
  '| both@5', (r.both * 100).toFixed(1).padStart(5) + '%',
);

console.log(`cost ${cost} | ratio ${ratio} | EV budget ${EV.toFixed(1)} EP per ticket\n`);

const bands = opt('bands', null);
if (bands) {
  for (const spec of bands.split(',')) {
    const [name, pair] = spec.trim().split(':');
    const m = data.MASCOTS.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!m) { console.log(`unknown mascot: ${name}`); continue; }
    const [up, down] = pair.split('/').map(Number);
    print(m.name, row(m, up, down));
  }
}

const search = opt('search', null);
if (search) {
  const m = data.MASCOTS.find((x) => x.name.toLowerCase() === search.toLowerCase());
  if (!m) { console.log(`unknown mascot: ${search}`); process.exit(1); }
  const minReward = Number(opt('min-reward', 200));
  const maxReward = Number(opt('max-reward', 999));
  const by = opt('by', 'both');
  const results = [];
  for (let up = 1; up <= 14; up++) {
    for (let down = -1; down >= -14; down--) {
      const r = row(m, up, down);
      if (r.reward >= minReward && r.reward <= maxReward) results.push(r);
    }
  }
  results.sort((a, b) => (by === 'tight' ? b.sum - a.sum : b.both - a.both));
  console.log(`top bands for ${m.name} (reward ${minReward}-${maxReward}, sorted by ${by}):`);
  for (const r of results.slice(0, 8)) print(m.name, r);
}
