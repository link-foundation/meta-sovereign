import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const { Link, BinaryLinoCodec, BinaryLinoOptions, ArityRange, formatLinks } =
  await import(process.env.LINKS_NOTATION_MODULE ?? 'links-notation');
const document = Array.from(
  { length: 101 },
  (_, index) =>
    new Link('vacancy', [
      new Link(`https://example.test/vacancy/${index}`),
      new Link(`Requirements: Python and PostgreSQL. Record ${index}.`),
      new Link('Preserve complete employer prose and all observations.'),
    ])
);
for (const [external, tuples] of [
  [false, false],
  [true, true],
]) {
  const codec = new BinaryLinoCodec(
    new BinaryLinoOptions(external, new ArityRange(2, tuples ? null : 2))
  );
  const started = performance.now();
  const bytes = codec.encode(document);
  const encodeMs = performance.now() - started;
  assert.equal(formatLinks(codec.decode(bytes)), formatLinks(document));
  console.log(
    JSON.stringify({
      external,
      tuples,
      rows: 101,
      bytes: bytes.length,
      encodeMs,
    })
  );
}
