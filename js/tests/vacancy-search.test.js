import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import { hhSearchUrl, jobsBrowserOptions } from '../src/jobs/options.js';
import {
  validateVacancySearch,
  createVacancySearchReader,
} from '../src/jobs/read-search.js';
import { resolveAssignmentVacancy } from '../src/assignments/vacancy.js';
import { createAssignmentVacancyReader } from '../src/assignments/vacancy-reader.js';
import {
  vacancySnapshotFixture,
  vacancyUrl,
  searchFixture,
  gate,
  fakeVacancySession,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

test('typed vacancy filters preserve the selected resume and salary order across pages', () => {
  const input = {
    query: 'Python C++',
    resume: 'selected-resume',
    salary: 250000,
    currency: 'RUR',
    remote: true,
    area: '1',
    page: 2,
  };
  const url = new URL(hhSearchUrl(input));
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    text: 'Python C++',
    resume: 'selected-resume',
    salary: '250000',
    currency: 'RUR',
    page: '2',
    work_format: 'REMOTE',
    area: '1',
    order_by: 'salary_desc',
  });
  assert.equal(jobsBrowserOptions(input).useCase, 'jobs');
  assert.equal(Object.hasOwn(jobsBrowserOptions(input), 'headless'), false);
  assert.equal(
    jobsBrowserOptions({ headless: true, browserSlot: 'second' }).headless,
    true
  );
});

test('invalid vacancy settings never launch a browser or save a snapshot', async () => {
  const store = createMemoryStore();
  let reads = 0;
  const service = createVacancyService({
    store,
    readSearch: async () => {
      reads++;
    },
    readVacancy: async () => {
      reads++;
    },
  });
  try {
    for (const input of [
      null,
      [],
      { page: '1' },
      { page: -1 },
      { page: 1000 },
      { salary: '100' },
      { salary: NaN },
      { remote: 'false' },
      { order: 'random' },
      { currency: 'BAD' },
      { resume: 'bad&hash' },
      { area: 'a' },
      { headless: 'true' },
      { browserSlot: '../foreign' },
    ]) {
      assert.throws(() => service.search(input));
    }
    for (const input of [
      { url: 'https://hh.ru.evil.test/vacancy/123' },
      { url: vacancyUrl, refresh: 'true' },
    ]) {
      assert.throws(() => service.collect(input));
    }
    assert.equal(reads, 0);
    assert.deepEqual(await store.query(), []);
  } finally {
    await service.stop();
  }
});

test('search accepts exact next-page evidence and canonical vacancy identities', () => {
  const url = hhSearchUrl({ resume: 'selected' });
  const next = new URL(url);
  next.searchParams.set('page', '1');
  const read = searchFixture(url);
  read.next = next.href;
  read.cards[0].url = 'https://spb.hh.ru/vacancy/123?from=search';
  const result = validateVacancySearch(read, url);
  assert.equal(result.nextPage, 1);
  assert.equal(result.cards[0].url, vacancyUrl);
  assert.equal(result.cards[0].responded, false);
  assert.equal(
    validateVacancySearch(searchFixture(url, []), url).cards.length,
    0
  );
});

test('search refuses login, challenges, transient blanks, duplicate cards and changed next-page filters', () => {
  const url = hhSearchUrl({ resume: 'selected' });
  const read = searchFixture(url);
  for (const invalid of [
    { ...read, url: 'https://hh.ru/account/login' },
    { ...read, challenge: true },
    { ...read, cards: [], empty: false },
    { ...read, cards: [read.cards[0], read.cards[0]] },
    { ...read, cards: [{ ...read.cards[0], company: null }] },
    { ...read, next: false },
    { ...read, next: 'https://hh.ru/search/vacancy?page=1' },
    { ...read, next: url },
    { ...read, cards: [{ ...read.cards[0], responded: 'yes' }] },
  ]) {
    assert.throws(() => validateVacancySearch(invalid, url));
  }
});

test('collected descriptions and visible metadata survive cache reuse and assignment drafting', async () => {
  const store = createMemoryStore();
  const calls = [];
  const snapshot = vacancySnapshotFixture();
  const readVacancy = createAssignmentVacancyReader({
    store,
    openSession: async (options) => {
      calls.push(options);
      return fakeVacancySession(snapshot);
    },
  });
  const service = createVacancyService({ store, readVacancy });
  try {
    const first = await service.collect({ url: vacancyUrl });
    assert.equal(first.description, snapshot.description);
    assert.equal(first.salary, snapshot.salary);
    assert.equal(first.workFormat, snapshot.workFormat);
    assert.equal(calls[0].slot, 'jobs');
    assert.equal(calls[0].useCase, 'jobs');
    assert.equal(Object.hasOwn(calls[0], 'headless'), false);
    const cached = await service.collect({
      url: 'https://spb.hh.ru/vacancy/123?from=chat',
    });
    assert.equal(cached.id, first.id);
    const assignment = await resolveAssignmentVacancy(
      { store, readVacancy, signal: new AbortController().signal },
      { vacancyUrl },
      { url: 'https://example.test/task' }
    );
    assert.equal(assignment.vacancy.description, snapshot.description);
    assert.equal(calls.length, 1);
    assert.equal((await service.stored()).entries[0].salary, snapshot.salary);
  } finally {
    await service.stop();
  }
});

test('failed refresh preserves the successful cache and incomplete reads are never cached', async () => {
  const store = createMemoryStore();
  let snapshot = vacancySnapshotFixture();
  const service = createVacancyService({
    store,
    readVacancy: async () => snapshot,
  });
  try {
    const first = await service.collect({ url: vacancyUrl });
    snapshot = { ...snapshot, description: '' };
    await assert.rejects(service.collect({ url: vacancyUrl, refresh: true }));
    assert.deepEqual(await store.get(first.id), first);
    await assert.rejects(service.collect({ url: 'https://hh.ru/vacancy/456' }));
    assert.equal((await service.stored()).entries.length, 1);
    snapshot = { ...vacancySnapshotFixture(), salary: null };
    await assert.rejects(service.collect({ url: vacancyUrl, refresh: true }));
    assert.deepEqual(await store.get(first.id), first);
  } finally {
    await service.stop();
  }
});

test('restarted readers use the saved vacancy without opening or resuming a browser', async () => {
  const store = createMemoryStore();
  const first = createVacancyService({
    store,
    readVacancy: async () => vacancySnapshotFixture(),
  });
  await first.collect({ url: vacancyUrl });
  await first.stop();
  let reads = 0;
  const restarted = createVacancyService({
    store,
    readVacancy: async () => {
      reads++;
      throw new Error('must not read');
    },
  });
  try {
    assert.equal((await restarted.stored()).entries.length, 1);
    assert.equal(
      (await restarted.collect({ url: vacancyUrl })).title,
      'Python engineer'
    );
    assert.equal(reads, 0);
  } finally {
    await restarted.stop();
  }
});

test(
  'cancellation drains a late search launch, refuses concurrent ownership and allows another finite read',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const started = gate(),
      launch = gate(),
      closed = gate();
    const calls = [];
    let opens = 0;
    const openSession = async () => {
      opens++;
      if (opens === 1) {
        started.resolve();
        await launch.promise;
      }
      const session = fakeVacancySession(searchFixture(hhSearchUrl({})), calls);
      session.close = async () => {
        calls.push('closing');
        await closed.promise;
        calls.push('closed');
      };
      return session;
    };
    const service = createVacancyService({ store, openSession });
    const other = createVacancyService({ store });
    try {
      const work = service.search({});
      const rejected = assert.rejects(work, { code: 'assignment-stopped' });
      await started.promise;
      await assert.rejects(other.search({}), { code: 'jobs-busy' });
      let drained = false;
      const cancelled = service.cancel().then(() => {
        drained = true;
      });
      await Promise.resolve();
      assert.equal(drained, false);
      launch.resolve();
      await Promise.resolve();
      assert.equal(drained, false);
      closed.resolve();
      await Promise.all([cancelled, rejected]);
      assert.deepEqual(calls, ['closing', 'closed']);
      assert.equal((await service.search({})).cards.length, 1);
      await service.stop();
      await assert.rejects(service.search({}), { code: 'jobs-stopped' });
    } finally {
      launch.resolve();
      closed.resolve();
      await Promise.all([service.stop(), other.stop()]);
    }
  }
);

test('search reader passes explicit policy overrides and closes after identity refusal', async () => {
  const calls = [];
  const read = createVacancySearchReader({
    store: {},
    openSession: async (options) => {
      calls.push(options);
      return fakeVacancySession(
        searchFixture('https://hh.ru/account/login'),
        calls
      );
    },
  });
  await assert.rejects(
    read(hhSearchUrl({}), { browserSlot: 'second', headless: true }),
    { code: 'jobs-search-unavailable' }
  );
  assert.equal(calls[0].headless, true);
  assert.equal(calls[0].slot, 'second');
  assert.equal(calls.at(-1), 'closed');
});

test('capabilities report missing browser support without pretending to apply', async () => {
  const service = createVacancyService({
    store: createMemoryStore(),
    availability: async () => ({
      available: false,
      reason: 'missing-packages',
    }),
  });
  try {
    assert.deepEqual(await service.capabilities(), {
      available: false,
      reason: 'missing-packages',
      search: false,
      collect: false,
      resumes: false,
      resumeExport: false,
      cached: true,
      localChoices: true,
      selectionReview: false,
      technologyAnalysis: true,
      technologyReview: true,
      technologyProviderSave: false,
      cvTranslation: true,
      cvSaveWatch: false,
      applicationReview: false,
      apply: false,
    });
  } finally {
    await service.stop();
  }
});
