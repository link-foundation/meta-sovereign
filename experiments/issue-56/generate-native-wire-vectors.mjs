// Golden cross-language records from the installed production JavaScript codec.
// Regenerate explicitly from the repository root; no accounts or network I/O.
import { writeFile } from 'node:fs/promises';
import {
  encodeWire,
  decodeWire,
  LINO_TEXT,
  LINO_BINARY,
  LINO_LINE,
} from '../../js/src/transport/lino.js';

const values = [
  null,
  true,
  false,
  0,
  -1,
  12.5,
  1e18,
  -9007199254740992,
  '你好 🚀 Привет',
  '',
  [],
  {},
  [true],
  [null],
  [null, 1],
  ['null'],
  ['array', 7],
  {
    count: 1e18,
    1000000000000000000: '1000000000000000000',
    nested: [-9007199254740992, [null]],
  },
  [[false]],
  {
    single: [true],
    emptyArray: [],
    emptyObject: {},
    body: '你好\r\n"quoted"\t\0% 🚀',
    '': '',
    escaped: 'base64',
    'key\r\n': 7,
  },
  {
    str: 'true',
    numeric: '123',
    null: 'null',
    quotes: 'a"""b',
    o: 'a:',
    nested: [{ 'colon: key': ['x', null, false] }],
  },
];
const types = [LINO_TEXT, LINO_BINARY, LINO_LINE, 'text/lino-compact'];
const vectors = values.map((value) => ({
  value,
  records: types.map((type) => {
    const bytes = Buffer.from(encodeWire(value, type));
    const actual = decodeWire(bytes, type);
    if (JSON.stringify(actual) !== JSON.stringify(value)) {
      throw new Error(`codec roundtrip failed: ${type}`);
    }
    return { type, hex: bytes.toString('hex') };
  }),
}));
await writeFile(
  'rust/crates/meta-sovereign-server/tests/fixtures/lino-wire.json',
  `${JSON.stringify(vectors, null, 2)}\n`
);
