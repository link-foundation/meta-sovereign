import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createBrowserStore } from '../src/storage/browser-store.js';
import { indexAnswerArchive } from '../src/automation/question-archive.js';
import {
  learnSavedAnswers,
  listAnswerRules,
  saveAnswerRule,
} from '../src/automation/question-store.js';

const message = (id, sender, body, extra = {}) => ({
  id: `msg:hh:1:${id}`,
  source: 'hh',
  chat: '1',
  sender,
  body,
  timestamp: new Date(1700000000000 + id * 1000).toISOString(),
  ...extra,
});

test(
  'learning includes archived turns older than the former recent window',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    await store.put(message(1, 'them', 'Where do you live?'));
    await store.put(message(2, 'me', 'Vietnam.'));
    // Finite boundary fixture: two old records plus the former 12,500-record cap.
    for (let id = 3; id <= 12502; id++) {
      await store.put(
        message(id, 'them', 'Archived notice.', { chat: 'other' })
      );
    }
    const preview = await learnSavedAnswers(store);
    assert.equal(preview.rules.length, 1);
    assert.equal(preview.rules[0].answers[0].count, 1);
    assert.equal(preview.coverage.limited, false);
    assert.equal(preview.coverage.retained, 12502);
    assert.equal(preview.coverage.scope, 'archive');
    assert.deepEqual(await listAnswerRules(store), []);
  }
);

test(
  'full archive counts survive shuffled imports, repeated runs and bounded evidence',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const records = [];
    for (let turn = 0; turn < 103; turn++) {
      records.push(message(turn * 3 + 1, 'them', 'Where do you live?'));
      records.push(message(turn * 3 + 2, 'me', 'Vietnam.'));
      records.push(message(turn * 3 + 3, 'them', 'Thanks.'));
    }
    for (const record of records.reverse()) {
      await store.put(record);
    }
    await learnSavedAnswers(store, { apply: true });
    const [rule] = await listAnswerRules(store);
    assert.equal(rule.answers[0].count, 103);
    assert.equal(rule.answers[0].evidence.length, 100);
    rule.answers[0].approved = true;
    rule.answers[0].canonical = true;
    await saveAnswerRule(store, rule);
    await learnSavedAnswers(store, { apply: true });
    const [again] = await listAnswerRules(store);
    assert.equal(again.answers[0].count, 103);
    assert.equal(again.answers[0].approved, true);
    assert.equal(again.answers[0].canonical, true);
  }
);

test(
  'archive learning refuses to apply when messages change during its read',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    await store.put(message(1, 'them', 'Where do you live?'));
    await store.put(message(2, 'me', 'Vietnam.'));
    const get = store.get;
    let edited = false;
    store.get = async (id, project) => {
      if (id.startsWith('msg:') && !edited) {
        edited = true;
        await store.put(message(2, 'me', 'Changed while reading.'));
      }
      return get(id, project);
    };
    await assert.rejects(
      learnSavedAnswers(store, { apply: true }),
      /archive changed/iu
    );
    assert.deepEqual(await listAnswerRules(store), []);
  }
);

test('archive index retains metadata alone and refuses an over-capacity index', async () => {
  const store = createMemoryStore();
  await store.put(
    message(1, 'them', 'Where do you live?', { raw: 'provider data' })
  );
  const index = await indexAnswerArchive(store);
  const [chat] = index.chats.values();
  assert.deepEqual(Object.keys(chat.entries[0]), ['id', 'timestamp']);
  await assert.rejects(indexAnswerArchive(store, 1), /metadata capacity/iu);
  assert.deepEqual(await listAnswerRules(store), []);
});

test('chronology gaps exclude the whole affected conversation and preserve barriers elsewhere', async () => {
  const store = createMemoryStore();
  const records = [
    message(1, 'them', 'Where do you live?'),
    message(2, 'me', 'Vietnam.'),
    message(3, 'them', 'Unknown chronology.', { timestamp: 'unknown' }),
    message(9, 'them', 'What is your experience?', { chat: 'valid' }),
    message(10, 'me', 'Five years.', { chat: 'valid' }),
    message(11, 'me', 'Distributed teams.', { chat: 'valid' }),
    message(12, 'them', 'What is your email?', { chat: 'valid' }),
    message(13, 'me', '', { chat: 'valid', service: true }),
    message(14, 'me', 'Unrelated later answer.', { chat: 'valid' }),
  ];
  for (const record of records.reverse()) {
    await store.put(record);
  }
  const result = await learnSavedAnswers(store);
  assert.equal(result.rules.length, 1);
  assert.equal(
    result.rules[0].answers[0].text,
    'Five years.\nDistributed teams.'
  );
  assert.equal(result.coverage.excludedChats, 1);
  assert.equal(result.coverage.retained, 6);
  assert.equal(result.coverage.limited, true);
});

test('browser learning uses metadata projections and numeric message order for equal timestamps', async () => {
  const store = await createBrowserStore();
  const timestamp = '2026-11-09T10:00:00Z';
  await store.put(message(10, 'me', 'Vietnam.', { timestamp }));
  await store.put(message(9, 'them', 'Where do you live?', { timestamp }));
  const batches = [];
  await store.scan(
    () => true,
    1,
    (batch) => batches.push(batch),
    (link) => ({ id: link.id })
  );
  assert.deepEqual(batches[0], [{ id: 'msg:hh:1:10' }]);
  assert.deepEqual(await store.get('msg:hh:1:9', (link) => ({ id: link.id })), {
    id: 'msg:hh:1:9',
  });
  const result = await learnSavedAnswers(store);
  assert.equal(result.rules[0].answers[0].count, 1);
  assert.equal(result.coverage.retained, 2);
  await store.flush();
});

test('too many observed variants fail explicitly before any proposal is applied', async () => {
  const store = createMemoryStore();
  for (let turn = 0; turn < 101; turn++) {
    await store.put(message(turn * 2 + 1, 'them', 'Where do you live?'));
    await store.put(message(turn * 2 + 2, 'me', `City number ${turn}.`));
  }
  await assert.rejects(
    learnSavedAnswers(store, { apply: true }),
    /capacity exceeded/iu
  );
  assert.deepEqual(await listAnswerRules(store), []);
});

test('merging into a full saved rule fails before modifying any saved rules', async () => {
  const store = createMemoryStore();
  await store.put(message(1, 'them', 'Where do you live?'));
  await store.put(message(2, 'me', 'Vietnam.'));
  const {
    rules: [proposal],
  } = await learnSavedAnswers(store);
  const saved = await saveAnswerRule(store, {
    ...proposal,
    answers: Array.from({ length: 100 }, (_, id) => ({
      text: `Approved city ${id}.`,
      count: 1,
      approved: true,
    })),
  });
  await assert.rejects(
    learnSavedAnswers(store, { apply: true }),
    /variant limit/iu
  );
  assert.deepEqual(await store.get(saved.id), saved);
});
