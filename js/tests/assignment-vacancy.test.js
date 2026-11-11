import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { assignmentVacancyUrl } from '../src/assignments/validation.js';
import { createAssignmentVacancyReader } from '../src/assignments/vacancy-reader.js';
import {
  rememberAssignmentRedirect,
  rememberAssignmentVacancy,
  storedAssignmentVacancy,
} from '../src/assignments/vacancy-association.js';
import { resolveAssignmentVacancy } from '../src/assignments/vacancy.js';

const original = 'https://forms.gle/fixture-assignment';
const resolved = 'https://docs.google.com/forms/d/e/fixture/viewform?entry=1';
const vacancyUrl = 'https://hh.ru/vacancy/123';
const snapshot = {
  url: vacancyUrl,
  title: 'Python engineer',
  description: 'Build internal services.',
  skills: ['Python'],
  company: 'Fixture Employer',
  capturedAt: '2026-01-01T00:00:00Z',
};
const message = (id = '1', vacancy = '123', body = `Complete ${original}`) => ({
  id: `msg:hh:${id}`,
  source: 'hh',
  chat: 'fixture-chat',
  body,
  raw: { vacancy: { id: vacancy } },
});
const context = (store, readVacancy) => ({
  store,
  readVacancy,
  signal: new AbortController().signal,
});

test('vacancy URLs accept canonical HH aliases and reject lookalikes or non-vacancy pages', () => {
  assert.equal(
    assignmentVacancyUrl('https://spb.hh.ru/vacancy/123/?from=chat#x'),
    vacancyUrl
  );
  for (const value of [
    'https://hh.ru.evil.test/vacancy/123',
    'http://hh.ru/vacancy/123',
    'https://hh.ru/vacancy/123/edit',
    'https://hh.ru/vacancy/123456789012345678901',
    'https://hh.ru:444/vacancy/123',
    'https://hh.ru/account/login',
  ]) {
    assert.throws(() => assignmentVacancyUrl(value), {
      code: 'assignment-vacancy-url',
    });
  }
});

test('stored HH links remember original and exact redirect aliases without matching another query', async () => {
  const store = createMemoryStore();
  await store.put(message());
  await store.put({ ...message('2', '999'), source: 'telegram' });
  await store.put({ ...message('3', '999'), deleted: true });
  await store.put(message('4', '999', `${resolved}extra`));
  await rememberAssignmentRedirect(store, original, resolved);
  for (const url of [original, resolved]) {
    const saved = await storedAssignmentVacancy(store, url);
    assert.equal(saved.vacancyUrl, vacancyUrl);
    assert.equal(saved.sourceMessageId, 'msg:hh:1');
    assert.deepEqual(saved.aliases, [original, resolved]);
  }
});

test('later conflicting messages invalidate the remembered redirect association', async () => {
  const store = createMemoryStore();
  await store.put(message());
  await rememberAssignmentRedirect(store, original, resolved);
  await store.put(message('2', '456', resolved));
  let reads = 0;
  await assert.rejects(
    resolveAssignmentVacancy(
      context(store, async () => {
        reads++;
        return snapshot;
      }),
      {},
      { url: resolved }
    ),
    { code: 'assignment-vacancy-ambiguous' }
  );
  assert.equal(reads, 0);
  const explicit = await resolveAssignmentVacancy(
    context(store, async () => snapshot),
    { vacancyUrl },
    { url: resolved }
  );
  assert.equal(explicit.source, 'url');
});

test('vacancy association tolerates malformed evidence and accepts exact imported context', async () => {
  const store = createMemoryStore();
  await store.put({
    ...message(),
    raw: null,
    answerContext: { evidence: { invalid: true } },
  });
  assert.equal(await rememberAssignmentVacancy(store, [original]), null);
  await store.put({
    ...message('2'),
    raw: null,
    answerContext: { evidence: 'vacancy:hh:123' },
  });
  assert.equal(
    (await rememberAssignmentVacancy(store, [original])).vacancyUrl,
    vacancyUrl
  );
});

test('chat vacancy snapshots are cached and refresh is explicit', async () => {
  const store = createMemoryStore();
  await store.put(message());
  let reads = 0;
  const env = context(store, async (url, { signal }) => {
    assert.equal(url, vacancyUrl);
    assert.equal(signal.aborted, false);
    reads++;
    return snapshot;
  });
  const first = await resolveAssignmentVacancy(env, {}, { url: original });
  assert.equal(first.source, 'chat');
  assert.equal(first.vacancy.company, snapshot.company);
  await resolveAssignmentVacancy(env, {}, { url: original });
  assert.equal(reads, 1);
  await resolveAssignmentVacancy(
    env,
    { refreshVacancy: true },
    { url: original }
  );
  assert.equal(reads, 2);
  await assert.rejects(
    resolveAssignmentVacancy(env, { refreshVacancy: 'yes' }, { url: original }),
    { code: 'assignment-input' }
  );
});

test('explicit snapshots need no browser and another vacancy response is never cached', async () => {
  const store = createMemoryStore();
  const env = context(store, async () => {
    throw new Error('must not read');
  });
  assert.equal(
    (
      await resolveAssignmentVacancy(
        env,
        { vacancy: snapshot },
        { url: original }
      )
    ).source,
    'provided'
  );
  await assert.rejects(
    resolveAssignmentVacancy(
      env,
      { vacancy: snapshot, vacancyUrl },
      { url: original }
    ),
    { code: 'assignment-input' }
  );
  await assert.rejects(
    resolveAssignmentVacancy(
      context(store, async () => ({
        ...snapshot,
        url: 'https://hh.ru/vacancy/456',
      })),
      { vacancyUrl },
      { url: original }
    ),
    { code: 'assignment-vacancy-invalid' }
  );
  assert.equal(
    (await store.query((row) => row.id.startsWith('assignment-vacancy:')))
      .length,
    0
  );
});

test('vacancy browser uses policy defaults, reads only, and closes its owned session', async () => {
  const calls = [];
  const read = createAssignmentVacancyReader({
    store: {},
    openSession: async (options) => {
      calls.push(options);
      return {
        commander: {
          goto: async (value) => calls.push(value),
          evaluate: async () => snapshot,
        },
        close: async () => calls.push('closed'),
      };
    },
  });
  const result = await read(vacancyUrl);
  assert.equal(result.title, snapshot.title);
  assert.equal(calls[0].platform, 'hh');
  assert.equal(calls[0].useCase, 'assignments');
  assert.equal(Object.hasOwn(calls[0], 'headless'), false);
  assert.equal(calls[1].url, vacancyUrl);
  assert.equal(calls.at(-1), 'closed');
});

test('aborting a pending browser launch waits for and closes the late session', async () => {
  let launch;
  let started;
  let closed = false;
  let navigated = false;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const read = createAssignmentVacancyReader({
    store: {},
    openSession: () => {
      started();
      return new Promise((resolve) => {
        launch = resolve;
      });
    },
  });
  const controller = new AbortController();
  const pending = read(vacancyUrl, { signal: controller.signal });
  const rejection = assert.rejects(pending, { code: 'assignment-stopped' });
  await ready;
  controller.abort();
  let done = false;
  pending
    .finally(() => {
      done = true;
    })
    .catch(() => {});
  await Promise.resolve();
  assert.equal(done, false);
  launch({
    commander: {
      goto: async () => {
        navigated = true;
      },
    },
    close: async () => {
      closed = true;
    },
  });
  await rejection;
  assert.equal(closed, true);
  assert.equal(navigated, false);
});

test('vacancy browser rejects login redirects, incomplete pages and oversized descriptions', async () => {
  for (const invalid of [
    { ...snapshot, url: 'https://hh.ru/account/login' },
    { ...snapshot, description: '' },
    { ...snapshot, description: 'x'.repeat(30001) },
  ]) {
    let closed = false;
    const read = createAssignmentVacancyReader({
      store: {},
      openSession: async () => ({
        commander: { goto: async () => {}, evaluate: async () => invalid },
        close: async () => {
          closed = true;
        },
      }),
    });
    await assert.rejects(read(vacancyUrl), (error) =>
      error.code.startsWith('assignment-')
    );
    assert.equal(closed, true);
  }
});
