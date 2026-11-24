// Finite, account-free codec probe with small documents and bounded decoding.
// node --max-old-space-size=128 --stack-size=1024 experiments/issue-56/lino-binary-probe.mjs
import assert from 'node:assert/strict';
import { encodeFor, decodeFrom } from 'lino-rest-api';
import { encodeCompact, decode } from 'lino-objects-codec';
import {
  BinaryLinoCodec,
  BinaryLinoOptions,
  DecodeLimits,
  Parser,
  formatLinks,
} from 'links-notation';

const codec = new BinaryLinoCodec(
  new BinaryLinoOptions(),
  new DecodeLimits({
    maxLinks: 4096,
    maxReferences: 8192,
    maxNodes: 256,
    maxStringBytes: 4096,
    maxDepth: 32,
  })
);
const samples = [
  {
    ok: true,
    nothing: null,
    count: 42,
    price: 1.5,
    empty: '',
    label: '你好\nПривет',
  },
  {
    items: [false, 0, 'true', '42', [], {}, ['a', 'b']],
    nested: { 'unsafe:key': 'quoted "value"' },
  },
];
for (const sample of samples) {
  const text = encodeFor(sample, 'text/lino');
  assert.deepEqual(decodeFrom(text, 'text/lino'), sample);
  for (const [kind, notation] of [
    ['readable', text],
    ['compact', encodeCompact({ obj: sample })],
  ]) {
    try {
      const bytes = codec.encode(
        new Parser({ maxInputSize: 1024, maxDepth: 20 }).parse(notation)
      );
      const restored = decode({ notation: formatLinks(codec.decode(bytes)) });
      assert.deepEqual(restored, sample);
      console.log(`${kind}: lossless, ${bytes.length} bytes`);
    } catch (error) {
      if (kind === 'compact') {
        throw error;
      }
      console.log(`${kind}: text AST does not preserve object codec semantics`);
    }
  }
}
for (const type of ['application/lino', 'application/lino-binary']) {
  assert.throws(() => encodeFor(samples[0], type), /Cannot encode/);
  assert.throws(() => decodeFrom(new Uint8Array(), type), /Cannot decode/);
  console.log(`lino-rest-api 0.2.1: ${type} unsupported`);
}
