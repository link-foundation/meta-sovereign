import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wordEligibility,
  meaningfulWords,
} from '../src/replies/meaningful-words.js';
import { learnedLibrary } from '../src/replies/learned-library.js';
import { createReplyService } from '../src/replies/reply-service.js';
import { createMemoryStore } from '../src/storage/universal.js';

const messages = [];
for (let n = 0; n < 5; n++) {
  const base = {
    source: 'telegram',
    chat: String(n),
    timestamp: new Date(1700000000000 + n * 60000).toISOString(),
  };
  messages.push({
    ...base,
    id: `msg:telegram:${n}:1`,
    sender: String(n),
    body: 'Ты программист?',
  });
  messages.push({
    ...base,
    id: `msg:telegram:${n}:2`,
    timestamp: new Date(1700000001000 + n * 60000).toISOString(),
    sender: 'me',
    body: n < 3 ? 'Да, программист.' : 'Программист, работаю удалённо.',
  });
}
messages.push({
  id: 'msg:telegram:6:1',
  source: 'telegram',
  chat: '6',
  sender: '6',
  body: 'уникальное сообщение',
  timestamp: '2026-10-31T00:00:00.000Z',
});

test('only repeated meaningful words qualify messages, five uses by default', () => {
  assert.deepEqual(meaningfulWords('И я на the and or в по за'), []);
  const out = wordEligibility(messages);
  assert.equal(out.eligible.size, 10);
  assert(!out.eligible.has('msg:telegram:6:1'));
  assert.equal(out.words[0].word, 'программист');
  assert.equal(out.words[0].count, 10);
  assert.equal(wordEligibility(messages, 11).eligible.size, 0);
  assert(meaningfulWords('GitHub programmer').includes('github'));
});

test('library shows observed variations, matching patterns and source-backed facts', () => {
  const out = learnedLibrary(messages, { isSelf: (s) => s === 'me' });
  assert.equal(out.groups[0].count, 5);
  assert.equal(out.groups[0].variations.length, 2);
  assert.equal(out.groups[0].variations[0].count, 3);
  assert(
    out.patterns.every((one) =>
      one.examples.every((text) => new RegExp(one.regex, one.flags).test(text))
    )
  );
  assert.equal(out.facts.length, 5);
  assert.equal(out.facts[0].question, 'Ты программист?');
  assert(out.facts.every((one) => one.evidence.length >= 2));
  assert.equal(
    learnedLibrary(messages, { isSelf: (s) => s === 'me', minFrequency: 20 })
      .groups.length,
    0
  );
});

test('library reuses bounded history, updates with live writes and saves threshold', async () => {
  const store = createMemoryStore();
  await store.putMany(messages);
  const service = createReplyService({ store });
  try {
    const first = await service.library();
    assert.equal(first.threshold, 5);
    assert.equal(first.eligible, 10);
    assert.equal(await service.library(), first, 'cached response reused');
    await service.saveLibraryThreshold(20);
    assert.equal((await service.library()).eligible, 0);
    await service.saveLibraryThreshold(1);
    assert.equal((await service.library()).eligible, 11);
  } finally {
    await service.close();
  }
});
