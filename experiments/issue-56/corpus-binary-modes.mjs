import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  BinaryLinoCodec,
  BinaryLinoOptions,
  ArityRange,
  DecodeLimits,
  Parser,
  formatLinks,
} from 'links-notation';
import { encodeCompact, decodeCompact } from '../../js/src/lino-objects.js';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { seedVacancyCorpus } from './vacancy-corpus-fixture.mjs';

// One finite 101-description corpus, no network, threads or stress input.
const input = { entries: await seedVacancyCorpus(createMemoryStore()) };
const parser = new Parser();
const document = parser.parse(encodeCompact({ obj: input }));
for (const [external, tuples] of [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
]) {
  const codec = new BinaryLinoCodec(
    new BinaryLinoOptions(external, new ArityRange(2, tuples ? null : 2)),
    new DecodeLimits()
  );
  let started = performance.now();
  const packet = codec.encodePacket(document);
  const graphMs = performance.now() - started;
  started = performance.now();
  const bytes = packet.toBytes();
  const serializeMs = performance.now() - started;
  started = performance.now();
  assert.deepEqual(
    decodeCompact({ notation: formatLinks(codec.decode(bytes)) }),
    input
  );
  console.log(
    JSON.stringify({
      external,
      tuples,
      rows: 101,
      links: packet.links().length,
      bytes: bytes.length,
      graphMs,
      serializeMs,
      decodeMs: performance.now() - started,
    })
  );
}
