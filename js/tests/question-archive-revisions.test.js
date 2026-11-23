import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  messageVersions,
  withMessageVersions,
} from '../src/storage/message-versions.js';
import {
  learnSavedAnswers,
  listAnswerRules,
  saveAnswerRule,
} from '../src/automation/question-store.js';

const message = (id, sender, body, extra = {}) => ({
  id: `msg:telegram:1:${id}`,
  source: 'telegram',
  chat: '1',
  sender,
  body,
  timestamp: new Date(1700000000000 + id * 1000).toISOString(),
  ...extra,
});
const ask = (id, body = 'Where do you live?') => message(id, 'them', body);
const reply = (id, body, extra) => message(id, 'me', body, extra);
const edit = async (store, id, ...bodies) => {
  for (const [index, body] of bodies.entries()) {
    await store.put(
      reply(id, body, {
        edited: new Date(1700001000000 + index * 1000).toISOString(),
      })
    );
  }
};
const frequencies = (rule) =>
  Object.fromEntries(rule.answers.map(({ text, count }) => [text, count]));

test('each distinct wording for one real answer turn counts once and retains source IDs', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([
    ask(1),
    reply(2, 'Hanoi.'),
    ask(3),
    reply(4, 'Da Nang.'),
    ask(5, 'Are you available on Monday?'),
    reply(6, 'Yes, from 9 a.m.'),
  ]);
  await edit(store, 2, 'Da Nang.', 'Hanoi.', 'Da Nang.');
  const preview = await learnSavedAnswers(store);
  const city = preview.rules.find(
    (rule) => rule.question === 'Where do you live?'
  );
  assert.deepEqual(frequencies(city), { 'Da Nang.': 2, 'Hanoi.': 1 });
  assert.deepEqual(frequencies(preview.rules.find((rule) => rule !== city)), {
    'Yes, from 9 a.m.': 1,
  });
  const old = city.answers.find(({ text }) => text === 'Hanoi.');
  assert.ok(old.evidence.includes(reply(2, '').id));
  assert.ok(old.evidence.some((id) => id.startsWith('message-version:')));
  assert.equal(old.approved, false);
  assert.deepEqual(await listAnswerRules(store), []);
  await learnSavedAnswers(store, { apply: true });
  await learnSavedAnswers(store, { apply: true });
  assert.deepEqual(
    frequencies(
      (await listAnswerRules(store)).find(({ id }) => id === city.id)
    ),
    {
      'Da Nang.': 2,
      'Hanoi.': 1,
    }
  );
});

test('reconstruct one edited bubble at a time with the real consecutive reply', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([
    ask(1, 'What is your engineering experience?'),
    reply(2, 'Five years.'),
    reply(3, 'Distributed teams.'),
    ask(4, 'Where do you live?'),
    reply(5, 'Hanoi.'),
  ]);
  await edit(store, 2, 'Six years.');
  await edit(store, 3, 'Startup teams.');
  await edit(store, 5, 'Could you clarify?');
  const result = await learnSavedAnswers(store);
  assert.deepEqual(frequencies(result.rules[0]), {
    'Six years.\nStartup teams.': 1,
    'Five years.\nStartup teams.': 1,
    'Six years.\nDistributed teams.': 1,
  });
  assert.deepEqual(frequencies(result.rules[1]), { 'Hanoi.': 1 });
});

test('archived wording still requires positive delivery, reply ownership and public text', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([
    ask(1),
    reply(2, 'Only appeared locally.', { delivery: 'unknown' }),
    ask(3),
    reply(4, 'An unrelated answer.', { replyTo: 'msg:telegram:1:99' }),
    ask(5),
    reply(6, 'https://example.org/private/interview remains invitation only.'),
    ask(7),
    reply(8, 'Hanoi.'),
    ask(9, 'Where is your office?'),
    message(10, 'them', 'Da Nang.'),
  ]);
  await edit(store, 2, 'Hanoi.');
  await edit(store, 4, 'Da Nang.');
  await edit(store, 6, 'Hanoi.');
  await store.delete(reply(8, '').id);
  await store.put(message(10, 'them', 'Hue.'));
  const result = await learnSavedAnswers(store);
  assert.deepEqual(frequencies(result.rules[0]), {
    'Hanoi.': 2,
    'Da Nang.': 1,
  });
  assert.equal(result.rules.length, 1);
});

test('explicit corrections exclude revised wording without changing the transcript', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([ask(1), reply(2, 'Hanoi.')]);
  await edit(store, 2, 'Da Nang.');
  const [learned] = (await learnSavedAnswers(store)).rules;
  await saveAnswerRule(store, {
    ...learned,
    answers: [{ text: 'Da Nang.', approved: true, canonical: true }],
  });
  const [corrected] = (await learnSavedAnswers(store)).rules;
  assert.deepEqual(frequencies(corrected), { 'Da Nang.': 1 });
  assert.equal((await store.get(reply(2, '').id)).body, 'Da Nang.');
  assert.equal(
    (await store.query((link) => link.kind === 'message-version')).some(
      (link) => link.snapshot.body === 'Hanoi.'
    ),
    true
  );
});

test('first-seen edits and missing snapshots report incomplete coverage', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([
    ask(1),
    reply(2, 'Hanoi.', { edited: '2023-11-15T00:00:00Z' }),
    ask(3),
    reply(4, 'Phu Quoc.'),
  ]);
  await edit(store, 4, 'Da Nang.');
  const history = await messageVersions(store, reply(4, '').id);
  await store.delete(history.versions[1].id);
  const preview = await learnSavedAnswers(store);
  assert.equal(preview.coverage.incompleteRevisionChains, 2);
  assert.deepEqual(frequencies(preview.rules[0]), {
    'Hanoi.': 1,
    'Da Nang.': 1,
  });
});

test('removing a revision while learning aborts before applying any proposals', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([ask(1), reply(2, 'Hanoi.')]);
  await edit(store, 2, 'Da Nang.');
  const history = await messageVersions(store, reply(2, '').id);
  const oldId = history.versions[1].id;
  const get = store.get;
  store.get = async (id, project) => {
    if (id === oldId) {
      await store.delete(id);
    }
    return get(id, project);
  };
  await assert.rejects(
    learnSavedAnswers(store, { apply: true }),
    /archive changed/u
  );
  assert.deepEqual(await listAnswerRules(store), []);
});

test('an over-capacity revision chain refuses before applying proposals', async () => {
  const store = withMessageVersions(createMemoryStore());
  await store.putMany([ask(1), reply(2, 'Hanoi.')]);
  await edit(
    store,
    2,
    ...Array.from({ length: 128 }, (_, index) =>
      index % 2 ? 'Hanoi.' : 'Da Nang.'
    )
  );
  await assert.rejects(
    learnSavedAnswers(store, { apply: true }),
    /revision capacity/u
  );
  assert.deepEqual(await listAnswerRules(store), []);
});
