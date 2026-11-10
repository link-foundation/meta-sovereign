import test from 'node:test';
import assert from 'node:assert/strict';
import { hhHistoryFixture } from '../../experiments/issue-56/hh-history-fixture.mjs';
import {
  hhSource,
  hhNegotiationsToLinks,
  createHhLive,
} from '../src/sources/hh.js';
import { importInto } from '../src/sources/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';
import { learnSavedAnswers } from '../src/automation/question-store.js';

test('HH nested archive retains actual applicant turns without learning applications', async () => {
  const store = withMessageVersions(createMemoryStore());
  assert.equal(await importInto(store, 'hh', hhHistoryFixture()), 4);
  const preview = await learnSavedAnswers(store);
  assert.equal(preview.rules.length, 1);
  assert.equal(preview.rules[0].question, 'Where do you live?');
  assert.deepEqual(preview.rules[0].answers, [
    {
      text: 'Vietnam.',
      count: 1,
      approved: false,
      canonical: false,
      evidence: ['msg:hh:56002'],
    },
  ]);
  assert.equal((await store.get('msg:hh:56004')).service, true);
});

test('HH archive and live normalization agree on nested messages and retain role evidence', async () => {
  const fixture = hhHistoryFixture();
  const archive = await hhSource.parseArchive(JSON.stringify(fixture));
  const live = hhNegotiationsToLinks({ items: fixture.negotiations });
  assert.deepEqual(archive, live);
  assert.equal(archive[0].outgoing, false);
  assert.equal(archive[1].outgoing, true);
  assert.equal(archive[1].sender, 'applicant');
  assert.deepEqual(archive[1].raw, fixture.negotiations[0].messages.items[1]);
});

test('HH repeated imports count a turn once and preserve edits without learning old versions', async () => {
  const store = withMessageVersions(createMemoryStore());
  await importInto(store, 'hh', hhHistoryFixture());
  await importInto(store, 'hh', hhHistoryFixture());
  assert.equal((await learnSavedAnswers(store)).rules[0].answers[0].count, 1);
  const edited = hhHistoryFixture('Thailand.');
  edited.negotiations[0].messages.items[1].edited_at = '2026-11-09T11:00:00Z';
  await importInto(store, 'hh', edited);
  const next = await learnSavedAnswers(store);
  assert.equal(next.rules[0].answers[0].text, 'Thailand.');
  assert.equal(next.rules[0].answers[0].count, 1);
  const history = await messageVersions(store, 'msg:hh:56002');
  assert.deepEqual(
    history.versions.map((v) => v.snapshot.body),
    ['Thailand.', 'Vietnam.']
  );
  assert.equal(history.versions[0].editedAt, '2026-11-09T11:00:00.000Z');
  assert.equal(next.coverage.retained, 4);
});

test('HH explicit replies prevent an unrelated applicant message teaching the adjacent question', async () => {
  const fixture = hhHistoryFixture();
  fixture.negotiations[0].messages.items[1].reply_to = { id: 'older-question' };
  const store = createMemoryStore();
  await importInto(store, 'hh', fixture);
  assert.equal(
    (await store.get('msg:hh:56002')).replyTo,
    'msg:hh:older-question'
  );
  assert.equal((await learnSavedAnswers(store)).rules.length, 0);
  fixture.negotiations[0].messages.items[1].reply_to = { id: '56001' };
  await importInto(store, 'hh', fixture);
  assert.equal((await learnSavedAnswers(store)).rules[0].answers[0].count, 1);
});

test('HH joins consecutive applicant bubbles and does not bridge missing chronology', async () => {
  const fixture = hhHistoryFixture();
  const records = fixture.negotiations[0].messages.items;
  records[1].text = 'Nha Trang.';
  records.splice(2, 0, {
    ...records[1],
    id: '560021',
    text: 'Vietnam.',
    created_at: '2026-11-09T10:00:02.500Z',
  });
  const store = createMemoryStore();
  await importInto(store, 'hh', fixture);
  assert.equal(
    (await learnSavedAnswers(store)).rules[0].answers[0].text,
    'Nha Trang.\nVietnam.'
  );
  delete records[1].created_at;
  fixture.negotiations[0].created_at = '2026-11-09T09:00:00Z';
  await importInto(store, 'hh', fixture);
  const blocked = await learnSavedAnswers(store);
  assert.equal(blocked.rules.length, 0);
  assert.equal(blocked.coverage.excludedChats, 1);
});

test('HH cards and empty histories never invent observed messages', () => {
  assert.deepEqual(
    hhNegotiationsToLinks({
      items: [
        {
          id: 'card',
          created_at: '2026-11-09T09:00:00Z',
          employer: { id: 'hr' },
        },
        { id: 'empty', text: 'Card text', messages: [] },
        { id: 'url', messages: 'https://api.hh.ru/negotiations/url/messages' },
        null,
      ],
    }),
    []
  );
  assert.throws(
    () =>
      hhNegotiationsToLinks({
        items: [{ id: 'missing', messages: [{ text: 'No message ID' }] }],
      }),
    /stable ID/u
  );
});

test('HH legacy flat archives preserve IDs and vacancy keys without inventing author direction', async () => {
  const [link] = await hhSource.parseArchive({
    negotiations: [
      {
        id: 'legacy',
        vacancy: { id: '42' },
        author: { id: 'owner' },
        text: 'Saved text',
        created_at: '2026-11-09T09:00:00Z',
      },
    ],
  });
  assert.equal(link.id, 'msg:hh:legacy');
  assert.equal(link.chat, 'vacancy:42');
  assert.equal(link.sender, 'owner');
  assert.equal(link.outgoing, undefined);
  const unknown = hhHistoryFixture();
  unknown.negotiations[0].messages.items[1].author = {
    participant_type: 'unknown',
  };
  const store = createMemoryStore();
  await importInto(store, 'hh', unknown);
  assert.equal((await learnSavedAnswers(store)).rules.length, 0);
});

test('HH deleted answers and applicant counterquestions never become reusable facts', async () => {
  for (const patch of [{ deleted: true }, { text: 'Can I work remotely?' }]) {
    const fixture = hhHistoryFixture();
    Object.assign(fixture.negotiations[0].messages.items[1], patch);
    const store = createMemoryStore();
    await importInto(store, 'hh', fixture);
    assert.equal((await learnSavedAnswers(store)).rules.length, 0);
  }
});

test('an unidentified nested message refuses the file before it can bridge a false answer turn', async () => {
  const fixture = hhHistoryFixture();
  fixture.negotiations[0].messages.items.splice(1, 0, {
    author: { participant_type: 'employer' },
    text: 'A different question?',
    created_at: '2026-11-09T10:00:01.500Z',
  });
  const store = createMemoryStore();
  await assert.rejects(importInto(store, 'hh', fixture), /stable ID/u);
  assert.deepEqual(await store.query(), []);
});

test('the live HH adapter uses the same observed-message normalization', async () => {
  const fixture = hhHistoryFixture();
  let reads = 0;
  const live = createHhLive({
    token: 'fixture-token',
    baseUrl: 'https://hh.invalid',
    fetchImpl: async (url) => {
      assert.equal(new URL(url).pathname, '/negotiations');
      reads++;
      return new globalThis.Response(
        JSON.stringify({ items: fixture.negotiations, page: 0, pages: 1 })
      );
    },
  });
  const pulled = await live.pullMessages({ protocol: 'negotiations' });
  assert.equal(reads, 1);
  assert.equal(pulled.links.length, 4);
  assert.equal(pulled.links[1].outgoing, true);
  assert.equal(pulled.links[3].service, true);
  assert.equal(pulled.nextOffset, null);
});
