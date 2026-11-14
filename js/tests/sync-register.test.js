import test from 'node:test';
import assert from 'node:assert/strict';
import {
  merge,
  tickVersion,
  vcCompare,
  vcMerge,
  vcTick,
} from '../src/sync/peer.js';
import { SYNC_STAMP } from '../src/sync/register.js';
import { syncWire } from '../src/sync/wire.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import {
  createBrowserStore,
  createInMemoryDriver,
} from '../src/storage/browser-store.js';

const link = (body, vc, extra = {}) => ({ id: 'shared', body, vc, ...extra });
const permutations = ([a, b, c]) => [
  [a, b, c],
  [a, c, b],
  [b, a, c],
  [b, c, a],
  [c, a, b],
  [c, b, a],
];
const writes = () => [
  link('A', { a: 2 }, { children: ['c2', 'c1'] }),
  link('B', { b: 1 }, { children: ['c3'] }),
  link('C', { a: 1, b: 1 }, { children: ['c1'] }),
];

test('equal vector/version and unversioned ties are commutative', () => {
  for (const clock of [{ vc: { a: 1 } }, { version: 'same' }, {}]) {
    const a = { id: 'shared', body: 'A', ...clock };
    const b = { id: 'shared', body: 'B', ...clock };
    assert.deepEqual(merge(a, b), merge(b, a));
  }
});

test('joined clocks do not promote a winning payload on later merges', () => {
  const [a, b, c] = writes();
  const left = merge(merge(a, b), c);
  const right = merge(a, merge(b, c));
  assert.deepEqual(left, right);
  assert.equal(left.body, 'A');
  assert.deepEqual(left.vc, { a: 2, b: 1 });
});

test('merge ignores object/vector insertion order and treats children as a set', () => {
  const a = link(
    'A',
    { a: 1, z: 1 },
    {
      raw: { z: 1, a: { y: 2, b: 3 } },
      children: ['z', 'a', 'z'],
    }
  );
  const b = {
    children: ['b', 'a'],
    raw: { a: { b: 3, y: 2 }, z: 1 },
    vc: { z: 1, a: 1 },
    body: 'B',
    id: 'shared',
  };
  assert.deepEqual(merge(a, b), merge(b, a));
  assert.deepEqual(merge(a, b).children, ['a', 'b', 'z']);
  assert.deepEqual(a.children, ['z', 'a', 'z'], 'inputs stay untouched');
});

test('decimal tick versions compare numerically across digit widths', () => {
  const a = { id: 'shared', body: 'old', version: tickVersion(9, 'z') };
  const b = { id: 'shared', body: 'new', version: tickVersion(10, 'a') };
  assert.equal(merge(a, b).body, 'new');
  assert.equal(merge(b, a).body, 'new');
});

test('absent vector entries equal explicit zero entries', () => {
  assert.equal(vcCompare({}, { a: 0 }), 0);
  assert.equal(vcCompare({ a: 1, b: 0 }, { a: 1 }), 0);
  assert.deepEqual(vcMerge({ a: 0 }, { b: 2 }), { b: 2 });
});

test('own prototype-shaped actor ids remain ordinary safe counters', () => {
  const clock = JSON.parse('{"__proto__":1,"constructor":2}');
  const joined = vcMerge({}, clock);
  assert.equal(Object.getPrototypeOf(joined), Object.prototype);
  assert.equal(Object.hasOwn(joined, '__proto__'), true);
  assert.equal(joined.__proto__, 1);
  assert.equal(vcTick(joined, '__proto__').__proto__, 2);
  assert.equal(vcTick({}, 'constructor').constructor, 1);
  assert.deepEqual(vcMerge(clock, {}), joined);
});

test('invalid counters and exhausted ticks fail explicitly', () => {
  for (const clock of [
    { a: -1 },
    { a: 0.5 },
    { a: '1' },
    { a: NaN },
    { a: Number.MAX_SAFE_INTEGER + 1 },
    [],
    null,
  ]) {
    for (const run of [
      () => vcMerge(clock, {}),
      () => vcCompare({}, clock),
      () => vcTick(clock, 'a'),
    ]) {
      assert.throws(run, { code: 'SYNC_CLOCK_INVALID' });
    }
  }
  assert.throws(() => vcTick({ a: Number.MAX_SAFE_INTEGER }, 'a'), {
    code: 'SYNC_CLOCK_INVALID',
  });
});

test('finite delivery permutations, grouping and duplicate deliveries converge', () => {
  const fixtures = [
    writes(),
    [link('A', { a: 1 }), link('B', { b: 1 }), link('C', { c: 1 })],
    [link('A', { a: 1 }), link('B', { a: 1 }), link('C', { a: 1 })],
    [link('A', {}), link('B', { a: 0 }), link('C', { b: 0 })],
    [link('A', undefined), link('B', { b: 1 }), link('C', { a: 2 })],
    ['9-z', '10-a', 'legacy'].map((version) => ({ id: 'shared', version })),
  ];
  for (const records of fixtures) {
    const expected = merge(merge(records[0], records[1]), records[2]);
    for (const [a, b, c] of permutations(records)) {
      assert.deepEqual(merge(merge(a, b), c), expected);
      assert.deepEqual(merge(a, merge(b, c)), expected);
      assert.deepEqual(merge(expected, merge(a, c)), expected);
      assert.deepEqual(merge(expected, expected), expected);
    }
  }
});

test('a tick of the observed clock starts a new causal assignment', () => {
  const [a, b, c] = writes();
  const joined = merge(merge(a, b), c);
  assert.deepEqual(joined[SYNC_STAMP].clock, { a: 2 });
  const changed = { ...joined, body: 'owner edit', vc: vcTick(joined.vc, 'a') };
  const result = merge(changed, joined);
  assert.equal(result.body, 'owner edit');
  assert.deepEqual(result.vc, { a: 3, b: 1 });
  assert.equal(Object.hasOwn(result, SYNC_STAMP), false);
  for (const old of [a, b, c]) {
    assert.deepEqual(merge(result, old), result);
    assert.deepEqual(merge(old, result), result);
  }
});

test('counter sums remain exact beyond the safe integer total', () => {
  const n = Number.MAX_SAFE_INTEGER;
  const old = link('z', { a: n, b: n - 1 });
  const next = link('a', { a: n, b: n });
  assert.equal(merge(old, next).body, 'a');
});

test('an in-place vector increment cannot mutate the retained stamp context', () => {
  const [a, b] = writes();
  const joined = merge(a, b);
  joined.vc.a += 1;
  joined.body = 'owner edit';
  assert.deepEqual(joined[SYNC_STAMP].context, { a: 2, b: 1 });
  assert.equal(merge(joined, b).body, 'owner edit');
  assert.equal(Object.hasOwn(merge(joined, b), SYNC_STAMP), false);
});

test('merging an older packet preserves the winning local payload types', () => {
  const old = link('old', { a: 1 });
  const at = new Date('2026-11-13T00:00:00Z');
  const current = link(
    'new',
    { a: 2 },
    {
      at,
      special: NaN,
      missing: undefined,
      providerId: 123n,
      raw: { bytes: new Uint8Array([0, 255]) },
    }
  );
  const result = merge(old, current);
  assert.deepEqual(result, current);
  assert.equal(result.at, at);
  assert.equal(Object.hasOwn(result, 'missing'), true);
});

test('typed payload ties stay commutative without erasing local data types', () => {
  const values = [
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -0,
    0,
    12n,
    '12',
    new Date('2026-11-13T00:00:00Z'),
    '2026-11-13T00:00:00.000Z',
    new Uint8Array([0, 255]),
    { 0: 0, 1: 255 },
  ];
  for (const left of values) {
    for (const right of values) {
      const a = link(left, { a: 1 });
      const b = link(right, { a: 1 });
      assert.deepEqual(merge(a, b), merge(b, a));
    }
  }
});

test('invalid stamps, mismatched ids and invalid child ids are refused', () => {
  const base = link('value', { a: 1 });
  for (const stamp of [
    null,
    { version: 2 },
    { version: 1, context: { a: 1 }, clock: { a: 2 } },
    { version: 1, context: { b: 1 }, clock: { b: 1 } },
  ]) {
    assert.throws(() => merge(base, { ...base, [SYNC_STAMP]: stamp }), {
      code: 'SYNC_VALUE_INVALID',
    });
  }
  assert.throws(() => merge(base, { ...base, id: 'different' }), {
    code: 'SYNC_VALUE_INVALID',
  });
  assert.throws(() => merge(base, { ...base, children: [123] }), {
    code: 'SYNC_VALUE_INVALID',
  });
});

for (const format of [LINO_TEXT, LINO_BINARY]) {
  test(`${format}: original write rank survives the sync codec`, () => {
    const [a, b, c] = writes();
    const wire = syncWire({ format });
    const encode = (link) =>
      wire.decode(wire.encode({ type: 'put', link })).link;
    const snapshot = encode(merge(a, b));
    assert.deepEqual(snapshot[SYNC_STAMP].clock, { a: 2 });
    assert.deepEqual(merge(snapshot, encode(c)), encode(merge(a, merge(b, c))));
  });
}

test(
  'winning write rank survives a browser store flush and reopen',
  { timeout: 2000 },
  async () => {
    const driver = createInMemoryDriver();
    const store = await createBrowserStore({ driver });
    const [a, b, c] = writes();
    await store.put(merge(a, b));
    await store.flush();
    const reopened = await createBrowserStore({ driver });
    const stored = await reopened.get('shared');
    assert.deepEqual(stored[SYNC_STAMP].clock, { a: 2 });
    assert.deepEqual(merge(stored, c), merge(a, merge(b, c)));
  }
);
