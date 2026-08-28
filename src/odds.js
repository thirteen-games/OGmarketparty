// Live ticket odds.
//
// A bounty at offset d (relative to the mascot's step at purchase) pays out
// iff the mascot's walk ever reaches or crosses d — an upward roll collects
// every step it passes over, so "crossed" and "collected" are the same thing.
// That makes the payout chance a first-passage probability, which we compute
// exactly with a small dynamic program over the die faces (all 10 equally
// likely). Board-edge clamping at 0/100 and active news alerts are ignored;
// both are rare and small effects.

// Probability that at least one of `offsets` is collected within `rolls` rolls.
// `forced` models an active Mascot News alert: {direction: 1|-1, rolls: k}
// means the mascot's next k rolls re-roll until they match the direction —
// equivalently, they draw uniformly from just that sign's faces.
export function collectProbability(mascot, offsets, rolls, forced = null) {
  const up = Math.min(...offsets.filter((o) => o > 0), Infinity);
  const down = Math.max(...offsets.filter((o) => o < 0), -Infinity);
  let dist = new Map([[0, 1]]); // position offset -> probability, not yet collected
  let hit = 0;
  for (let k = 0; k < rolls; k++) {
    let faces = mascot.rolls;
    if (forced && k < forced.rolls) {
      faces = faces.filter((r) => (forced.direction > 0 ? r > 0 : r < 0));
    }
    const p = 1 / faces.length;
    const next = new Map();
    for (const [pos, prob] of dist) {
      for (const m of faces) {
        const q = pos + m;
        if (q >= up || q <= down) hit += prob * p;
        else next.set(q, (next.get(q) || 0) + prob * p);
      }
    }
    dist = next;
  }
  return hit;
}

// Bucket a payout probability into the prototype's difficulty vocabulary.
export function oddsLabel(prob) {
  if (prob >= 0.75) return 'Very Easy';
  if (prob >= 0.55) return 'Easy';
  if (prob >= 0.4) return 'Medium';
  if (prob >= 0.25) return 'Hard';
  return 'Very Hard';
}
