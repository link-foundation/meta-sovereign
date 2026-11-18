import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ArityRange,
  BinaryLinoCodec,
  BinaryLinoOptions,
  LinksPacket,
  Parser,
  formatLinks,
} from 'links-notation';
import { encodeCompact, decodeCompact } from '../src/lino-objects.js';
import { LINO_BINARY, encodeWire, decodeWire } from '../src/transport/lino.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { seedVacancyCorpus } from '../../experiments/issue-56/vacancy-corpus-fixture.mjs';

const parser = new Parser();
const options = { timeout: 5000 };
const input = {
  text: 'Привет 你好 😀\n"quoted"',
  values: ['', '001', '-0', '1e18', 1e18, true, false, null, [], {}, [null]],
};

test(
  'binary object replies round-trip through the independently configured published codec',
  options,
  () => {
    const bytes = encodeWire(input, LINO_BINARY);
    assert.deepEqual(
      decodeCompact({
        notation: formatLinks(new BinaryLinoCodec().decode(bytes)),
      }),
      input
    );
  }
);

test(
  'binary readers preserve all published external/arity variants including old replies',
  options,
  () => {
    const document = parser.parse(encodeCompact({ obj: input }));
    for (const external of [false, true]) {
      for (const max of [2, null]) {
        const codec = new BinaryLinoCodec(
          new BinaryLinoOptions(external, new ArityRange(2, max))
        );
        assert.deepEqual(
          decodeWire(codec.encode(document), LINO_BINARY),
          input
        );
      }
    }
  }
);

test(
  'complete description replies avoid linked character lists without dropping data',
  options,
  async () => {
    const input = { entries: await seedVacancyCorpus(createMemoryStore(), 8) };
    const document = parser.parse(encodeCompact({ obj: input }));
    const legacy = new BinaryLinoCodec().encode(document);
    const bytes = encodeWire(input, LINO_BINARY);
    const oldCount = LinksPacket.fromBytes(legacy).links().length;
    const newCount = LinksPacket.fromBytes(bytes).links().length;
    assert(newCount * 2 < oldCount, `${newCount} links versus ${oldCount}`);
    assert(bytes.length < legacy.length);
    assert.deepEqual(decodeWire(bytes, LINO_BINARY), input);
  }
);
