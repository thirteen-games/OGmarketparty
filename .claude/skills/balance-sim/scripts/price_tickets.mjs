// Ticket parity pricing: for every ticket (or one mascot's), compute the
// reward that puts its expected EP-per-coin exactly on the payout-ratio
// curve, and compare with the current reward.
//
//   node price_tickets.mjs [--mascot Lev] [--ratios "5=1.7,10=2.1"] [--baseline 8.3]
//
// Dry-run only: prints the chart. Apply changes by editing src/data.js
// (deliberate — pricing decisions go past the user first).
import { data, collectProbability, BASELINE_EP_PER_COIN, SHOP_WINDOW } from './lib.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};

const B = Number(opt('baseline', BASELINE_EP_PER_COIN));
const ratios = { ...data.PAYOUT_RATIOS };
for (const pair of (opt('ratios', '') || '').split(',').filter(Boolean)) {
  const [cost, r] = pair.split('=');
  ratios[Number(cost)] = Number(r);
}
const mascotFilter = opt('mascot', null);

console.log(`baseline ${B} EP/coin | window ${SHOP_WINDOW} rolls | ratios ${JSON.stringify(ratios)}`);
console.log('id  | mascot  | targets  | cost | current | parity | diff | either@4');
const perTier = {};
for (const t of data.TICKETS) {
  const m = data.mascotById(t.mascotId);
  if (mascotFilter && m.name.toLowerCase() !== mascotFilter.toLowerCase()) continue;
  const offs = [t.target1, t.target2].filter((o) => o !== null);
  const p = offs.reduce((s, o) => s + collectProbability(m, [o], SHOP_WINDOW), 0);
  const parity = Math.round((B * t.cost * ratios[t.cost]) / p);
  const diff = t.reward - parity;
  (perTier[t.cost] ||= []).push((p * t.reward) / t.cost);
  console.log(
    String(t.id).padEnd(3), '|', m.name.padEnd(7), '|',
    offs.map((o) => (o > 0 ? '+' : '') + o).join('/').padEnd(8), '|',
    String(t.cost).padEnd(4), '|', String(t.reward).padStart(7), '|',
    String(parity).padStart(6), '|', (diff >= 0 ? '+' + diff : String(diff)).padStart(4), '|',
    (p * 100).toFixed(0) + '%',
  );
}
if (!mascotFilter) {
  console.log('\nactual EP/coin by tier (vs declared ratio):');
  const base = perTier[1].reduce((a, b) => a + b, 0) / perTier[1].length;
  for (const [cost, list] of Object.entries(perTier)) {
    const avg = list.reduce((a, b) => a + b, 0) / list.length;
    console.log(`cost ${String(cost).padStart(2)} | EP/coin ${avg.toFixed(2)} | ratio ${(avg / base).toFixed(2)} (declared ${ratios[cost]})`);
  }
}
