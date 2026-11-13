// Rich native expectations from actual production JavaScript, without builds.
import { readFile, writeFile } from 'node:fs/promises';
import { merge } from '../../js/src/sync/register.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { withCausalWrites } from '../../js/src/storage/causal-writes.js';
import { format } from 'prettier';
import { fixtures as typed } from './native-register-cases.mjs';

const record = (body, extra = {}) => ({ id: 'shared', body, ...extra });
const equal = (body, extra = {}) => record(body, { vc: { a: 1 }, ...extra });
const fixtures = {
  ...typed,
  rich_body: ['A', 'Z', 'B'].map((body) => equal(body)),
  rich_object: [
    equal({ z: [false, null, 'Привет'], 2: 'two', 10: 'ten' }),
    equal({ z: [false, null, 'Привет'], 10: 'ten', 2: 'two', a: true }),
    equal({ a: ['nested', { '\u{10000}': 2, '\ue000': 1 }] }),
  ],
  absent_clock: [record('unversioned'), equal('clocked'), record('legacy')],
  empty_clock: [
    record('Z'),
    record('A', { vc: {} }),
    record('B', { vc: null }),
  ],
  null_children: [equal('A', { children: null }), equal('B'), equal('C')],
  absent_children: ['A', 'Z', 'B'].map((s) => record(s)),
  nonstring_version: [true, ['10', 'a'], { a: 10 }].map((version) =>
    record('same', { version })
  ),
  numeric_version: [9, 10, 1e21].map((version) => record('same', { version })),
  numeric_exponents: [1e21, 1e-7, 1e-6].map((n) => equal({ n })),
  numeric_decimal: [0.00001, 1.2345678901234567, 1e20].map((n) => equal({ n })),
  numeric_limits: [Number.MAX_VALUE, Number.MIN_VALUE, -1.7e308].map((n) =>
    equal({ n })
  ),
  negative_zero: [
    equal(-0, { witness: 'Z' }),
    equal(0, { witness: 'A' }),
    equal(-0, { witness: 'B' }),
  ],
  deletion: [
    equal('old', { children: ['a'] }),
    { id: 'shared', __msSyncDeleted: 1, vc: { a: 2 } },
    equal('stale', { children: ['b'] }),
  ],
  recreation: [
    { id: 'shared', __msSyncDeleted: 1, vc: { a: 2 } },
    record('new', { vc: { a: 3 } }),
    equal('stale'),
  ],
};

// Preserve -0 in finite source inputs; JSON.stringify would erase its sign.
const json = (value) => {
  if (Object.is(value, -0)) {
    return '-0';
  }
  if (Array.isArray(value)) {
    return `[${value.map(json).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}:${json(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
const raw = `[\n${Object.entries(fixtures)
  .map(([name, records]) =>
    json({
      name,
      records,
      expected: merge(merge(records[0], records[1]), records[2]),
    })
  )
  .join(',\n')}\n]\n`;
const content = await format(raw, { parser: 'json' });
const numbers = [
  0,
  -0,
  1,
  -1,
  0.1,
  0.3,
  1 / 3,
  Math.PI,
  1.2345678901234567,
  1e-6,
  1e-7,
  1e-5,
  1e20,
  1e21,
  1e22,
  Number.MAX_VALUE,
  Number.MIN_VALUE,
  Number.MAX_SAFE_INTEGER,
  1000000000000000100,
  2.2250738585072014e-308,
  2.225073858507201e-308,
  1.0000000000000002,
  1.005,
  -1.7e308,
  1.234567890123456e-10,
  1.234567890123456e30,
];
const numericContent = await format(
  json(numbers.map((value) => ({ value, expected: String(value) }))),
  { parser: 'json' }
);
const ownerCases = [
  { name: 'fresh', value: record('new') },
  { name: 'observed', before: equal('old'), value: record('new') },
  {
    name: 'supplied_context',
    before: equal('old'),
    value: record('new', { vc: { b: 3, 'native-owner': 2, zero: 0 } }),
  },
  {
    name: 'replace_assignment',
    before: merge(equal('A'), record('Z', { vc: { b: 1 } })),
    value: record('owner'),
  },
  {
    name: 'supplied_assignment',
    value: merge(equal('A'), record('Z', { vc: { b: 1 } })),
  },
  { name: 'delete_missing', delete: true },
  { name: 'delete_existing', before: equal('old'), delete: true },
  {
    name: 'delete_null_children',
    before: equal('old', { children: null }),
    delete: true,
  },
  {
    name: 'delete_child_order',
    before: equal('old', { children: ['z', 'a', 'z'] }),
    delete: true,
  },
  {
    name: 'delete_empty_children',
    before: equal('old', { children: [] }),
    delete: true,
  },
  {
    name: 'recreate',
    before: { id: 'shared', __msSyncDeleted: 1, vc: { a: 2 } },
    value: record('recreated'),
  },
  {
    name: 'delete_twice',
    before: { id: 'shared', __msSyncDeleted: 1, vc: { a: 2 } },
    delete: true,
  },
];
for (const fixture of ownerCases) {
  const inner = createMemoryStore();
  if (fixture.before) {
    await inner.put(fixture.before);
  }
  const store = withCausalWrites(inner, { actor: 'native-owner' });
  if (fixture.delete) {
    await store.delete('shared');
    fixture.expected = await inner.get('shared');
  } else {
    fixture.expected = await store.put(fixture.value);
  }
}
const ownerContent = await format(json(ownerCases), { parser: 'json' });
for (const [name, value] of [
  ['rich-register', content],
  ['number-strings', numericContent],
  ['owner-register', ownerContent],
]) {
  const destination = new URL(
    `../../rust/crates/meta-sovereign-server/tests/fixtures/${name}.json`,
    import.meta.url
  );
  if (process.argv.includes('--check')) {
    if ((await readFile(destination, 'utf8')) !== value) {
      throw new Error(`Native ${name} fixtures differ from JavaScript`);
    }
  } else {
    await writeFile(destination, value);
  }
}
console.log(
  `Verified ${Object.keys(fixtures).length} finite rich register fixtures and ${numbers.length} number strings; ${ownerCases.length} owner assignments`
);
