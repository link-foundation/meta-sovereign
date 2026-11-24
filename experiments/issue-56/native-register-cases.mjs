// Finite shared inputs; expected values come from the production JS merge.
import { merge } from '../../js/src/sync/register.js';
import { vcTick } from '../../js/src/sync/clock.js';

const link = (text, vc = {}, extra = {}) => ({
  id: 'shared',
  tokens: [text],
  children: [],
  vc,
  ...extra,
});
const original = [
  link('A', { a: 2 }, { children: ['z', 'a', 'z'] }),
  link('B', { b: 1 }, { children: ['b', 'a'] }),
  link('C', { a: 1, b: 1 }),
];
const joined = merge(original[0], original[1]);
const max = Number.MAX_SAFE_INTEGER;
export const fixtures = {
  synthetic_clock: original,
  equal_clock: ['A', 'Z', 'B'].map((text) => link(text, { a: 1 })),
  zero_counter: [link('A', { a: 0 }), link('Z'), link('B', { b: 0 })],
  exact_sum: [
    link('Z', { a: max, b: max - 1 }),
    link('A', { a: max, b: max }),
    link('C', { c: max }),
  ],
  unicode_actor: [
    link('A', { '\u{10000}': 1 }),
    link('B', { '\ue000': 1 }),
    link('C', { z: 1 }),
  ],
  indexed_actor: [
    link('A', { 10: 1, 2: 1, z: 1 }),
    link('B', { 11: 1, 2: 1, z: 1 }),
    link('C', { 10: 1, 3: 1, z: 1 }),
  ],
  escaped_payload: ['\u0001', '\n', '"\\'].map((text) => link(text)),
  unicode_children: [
    link('A', {}, { children: ['\ue000', '\u{10000}', 'z'] }),
    link('B', {}, { children: ['\u{10000}', 'a'] }),
    link('C'),
  ],
  tick_width: ['9-z', '10-a', '00010-z'].map((version) =>
    link(version, {}, { version })
  ),
  huge_tick: ['legacy', '99999999999999999999999999999999-a', '9-z'].map(
    (version) => link(version, {}, { version })
  ),
  newline_version: ['10-a\n', '9-z', '10-a\u2028'].map((version) =>
    link(version, {}, { version })
  ),
  retained_assignment: [joined, original[2], original[1]],
  owner_edit: [
    { ...joined, tokens: ['owner edit'], vc: vcTick(joined.vc, 'a') },
    original[0],
    original[2],
  ],
};
