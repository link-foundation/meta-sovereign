/**
 * Reply variation groups (R-C2).
 *
 * A `ReplyVariationGroup` is a labelled set of strings that all
 * answer the same prompt. `findCandidates(history, prompt)` returns
 * outgoing user messages whose Sørensen-Dice similarity to `prompt`
 * exceeds `threshold` — a tiny, dependency-free fuzzy ranker.
 */

const bigrams = (s) => {
  const out = new Set();
  const t = s.toLowerCase();
  for (let i = 0; i < t.length - 1; i += 1) {
    out.add(t.slice(i, i + 2));
  }
  return out;
};

export const dice = (a, b) => {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 && B.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) {
      inter += 1;
    }
  }
  return (2 * inter) / (A.size + B.size);
};

export const findCandidates = (history, prompt, threshold = 0.4) =>
  history
    .map((m) => ({ message: m, score: dice(prompt, m.body ?? m) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);

export const createReplyGroup = ({ id, label, variations }) => ({
  id: `reply:${id}`,
  tokens: ['reply-group', id, label],
  children: [],
  variations: [...variations],
});

export const pickVariation = (group, mode = 'random') => {
  if (mode === 'first') {
    return group.variations[0];
  }
  const i = Math.floor(Math.random() * group.variations.length);
  return group.variations[i];
};
