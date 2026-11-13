// Version vectors contain own, nonnegative safe integer counters only. Zero
// entries and absent entries mean the same thing; insertion order is irrelevant.
const invalid = () =>
  Object.assign(new Error('Invalid synchronization clock'), {
    code: 'SYNC_CLOCK_INVALID',
  });

export const normalizeClock = (clock) => {
  if (!clock || typeof clock !== 'object' || Array.isArray(clock)) {
    throw invalid();
  }
  const entries = Object.entries(clock);
  if (entries.some(([, n]) => !Number.isSafeInteger(n) || n < 0)) {
    throw invalid();
  }
  return Object.fromEntries(
    entries.filter(([, n]) => n > 0).sort(([a], [b]) => cmp(a, b))
  );
};

export const tickVersion = (now = Date.now(), node = 'local') =>
  `${now}-${node}`;
export const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const vcInit = () => ({});
export const vcTick = (clock, node) => {
  const out = normalizeClock(clock);
  const n = Object.hasOwn(out, node) ? out[node] : 0;
  if (typeof node !== 'string' || !node || n === Number.MAX_SAFE_INTEGER) {
    throw invalid();
  }
  return normalizeClock({ ...out, [node]: n + 1 });
};
export const vcMerge = (a, b) => {
  const left = normalizeClock(a);
  const right = normalizeClock(b);
  return Object.fromEntries(
    [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .map((key) => [
        key,
        Math.max(
          Object.hasOwn(left, key) ? left[key] : 0,
          Object.hasOwn(right, key) ? right[key] : 0
        ),
      ])
  );
};
export const vcCompare = (a, b) => {
  const left = normalizeClock(a);
  const right = normalizeClock(b);
  let greater = false;
  let less = false;
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const av = Object.hasOwn(left, key) ? left[key] : 0;
    const bv = Object.hasOwn(right, key) ? right[key] : 0;
    greater ||= av > bv;
    less ||= av < bv;
  }
  return greater && less ? null : greater ? 1 : less ? -1 : 0;
};
