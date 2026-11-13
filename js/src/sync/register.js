import { cmp, normalizeClock, vcCompare, vcMerge } from './clock.js';

// Reserved by schema 11. A joined vector describes observed writes, not the
// timestamp of the winning payload. Never promote that payload to the join.
export const SYNC_STAMP = '__msSyncStamp';
const invalid = (message) =>
  Object.assign(new Error(message), { code: 'SYNC_VALUE_INVALID' });
const supplied = (value) => value !== null && value !== undefined;

// Sort own object keys and tag types so null/NaN, absent/undefined, dates and
// strings cannot collide. Array/token order remains part of the identity.
// This is an internal tie key, not another wire encoding.
const keyValue = (value, depth = 0) => {
  if (depth > 64) {
    throw invalid('Synchronization value exceeds nesting limit');
  }
  if (value === null) {
    return ['null'];
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw invalid('Synchronization values must be data');
  }
  if (typeof value !== 'object') {
    return [typeof value, Object.is(value, -0) ? '-0' : String(value)];
  }
  if (value instanceof Date) {
    return ['date', String(value.getTime())];
  }
  if (value instanceof Uint8Array) {
    return ['bytes', [...value]];
  }
  if (Array.isArray(value)) {
    return ['array', value.map((item) => keyValue(item, depth + 1))];
  }
  return [
    'object',
    Object.keys(value)
      .sort()
      .map((key) => [key, keyValue(value[key], depth + 1)]),
  ];
};
const read = (link) => {
  const { vc, children, [SYNC_STAMP]: stamp, ...value } = link;
  if (typeof value.id !== 'string') {
    throw invalid('Synchronization value requires a link id');
  }
  if (
    supplied(children) &&
    (!Array.isArray(children) ||
      [...children].some((id) => typeof id !== 'string'))
  ) {
    throw invalid('Synchronization children must be link ids');
  }
  const context = supplied(vc) ? normalizeClock(vc) : null;
  let clock = context;
  if (stamp !== undefined) {
    if (!context || stamp?.version !== 1) {
      throw invalid('Invalid synchronization stamp');
    }
    const before = normalizeClock(stamp.context);
    const origin = normalizeClock(stamp.clock);
    const observed = vcCompare(context, before);
    if (
      ![0, 1].includes(observed) ||
      ![0, 1].includes(vcCompare(before, origin))
    ) {
      throw invalid('Synchronization stamp exceeds its observed clock');
    }
    // A local vcTick after reading this merged record is a new assignment.
    clock = observed === 1 ? context : origin;
  }
  return {
    value,
    // Keep the winning local payload's types intact. The established wire
    // boundary still owns network value normalization.
    key: JSON.stringify(keyValue(value)),
    context,
    clock,
    weight: clock
      ? Object.values(clock).reduce((n, v) => n + BigInt(v), 0n)
      : 0n,
    children: children ?? [],
    hasChildren: Object.hasOwn(link, 'children'),
  };
};

// Recognize tickVersion's decimal counter before its actor suffix; decimal
// width must not make 9 newer than 10. Opaque legacy versions retain lexical
// order within their category. Categories form one total order too.
const version = (value) => {
  const text = String(value ?? '');
  const tick = /^(\d+)(?:-(.*))?$/.exec(text);
  return tick ? [1, BigInt(tick[1]), tick[2] ?? ''] : [0, 0n, text];
};
const compare = (a, b) => {
  const av = version(a.value.version);
  const bv = version(b.value.version);
  return (
    cmp(a.clock !== null, b.clock !== null) ||
    cmp(a.weight, b.weight) ||
    cmp(JSON.stringify(a.clock), JSON.stringify(b.clock)) ||
    cmp(av[0], bv[0]) ||
    cmp(av[1], bv[1]) ||
    cmp(av[2], bv[2]) ||
    cmp(a.key, b.key)
  );
};

const assemble = (winner, left, right) => {
  const context =
    left.context && right.context
      ? vcMerge(left.context, right.context)
      : (left.context ?? right.context);
  return {
    ...winner.value,
    ...(context ? { vc: context } : {}),
    ...(context && vcCompare(context, winner.clock) !== 0
      ? {
          [SYNC_STAMP]: {
            version: 1,
            clock: { ...winner.clock },
            context: { ...context },
          },
        }
      : {}),
    ...(left.hasChildren || right.hasChildren
      ? { children: [...new Set([...left.children, ...right.children])].sort() }
      : {}),
  };
};

// Product of a max register, a joined observed clock and a grow-only child set.
// The immutable write rank is a linear extension of vector-clock dominance:
// a strict counter increase strictly increases its sum. Concurrent writes use
// canonical clock/version/payload ties, independent of delivery/key order.
export const merge = (a, b) => {
  if (!a && !b) {
    return a ?? b;
  }
  const left = read(a ?? b);
  const right = read(b ?? a);
  if (left.value.id !== right.value.id) {
    throw invalid('Cannot merge different link ids');
  }
  return assemble(compare(left, right) >= 0 ? left : right, left, right);
};
