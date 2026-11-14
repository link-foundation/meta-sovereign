import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';
import {
  resumeList,
  chooseSearchResume,
  HH_RESUMES_URL,
} from '../src/jobs/resume-list.js';
import { resumeDate } from '../src/jobs/resume-dates.js';
import { createResumeListReader } from '../src/jobs/read-resumes.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { resumeListFixture } from '../../experiments/issue-56/resume-list-fixture.mjs';
import {
  fakeVacancySession,
  gate,
} from '../../experiments/issue-56/vacancy-fixture.mjs';

test('resume choices explain title hints, latest timestamps, markers, ties and explicit hashes', () => {
  const list = resumeList(resumeListFixture());
  assert.deepEqual(chooseSearchResume(list), {
    hash: 'russian-new',
    reason: 'updated',
    languagePreference: 'ru',
    languageEvidence: 'title-hint',
  });
  assert.equal(
    chooseSearchResume(list, { resumeLanguage: 'any' }).hash,
    'english'
  );
  assert.equal(
    chooseSearchResume(list, { resumeLanguage: 'en' }).hash,
    'english'
  );
  assert.equal(
    chooseSearchResume(list, { resume: 'russian-old' }).reason,
    'specified'
  );
  const undated = {
    ...list,
    entries: list.entries.map((row) => ({ ...row, updatedAt: null })),
  };
  assert.equal(
    chooseSearchResume(undated, { resumeLanguage: 'any' }).reason,
    'latest'
  );
  assert.equal(chooseSearchResume(undated).hash, 'russian-old');
  const tie = {
    ...list,
    entries: list.entries.map((row) => ({ ...row, updatedAt: 1000 })),
  };
  assert.equal(chooseSearchResume(tie).hash, 'russian-old');
  assert.equal(chooseSearchResume({ entries: [] }).hash, null);
  assert.throws(() => chooseSearchResume(list, { resume: 'deleted' }), {
    code: 'jobs-resume-missing',
  });
  assert.throws(() => chooseSearchResume(list, { resume: 0 }));
  assert.throws(() => chooseSearchResume(list, { resumeLanguage: 'invalid' }));
});

test('visible Russian and English resume dates reject invalid calendar/time values', () => {
  const now = new Date(2026, 10, 12, 12);
  for (const text of [
    'Обновлено 10 ноября 2026 в 14:30',
    'Updated November 10, 2026 at 14:30',
    'Updated 10 November 2026 at 14:30',
    'Обновлено 10.11.2026 14:30',
  ]) {
    assert.equal(
      resumeDate(text, now),
      new Date(2026, 10, 10, 14, 30).getTime()
    );
  }
  assert.equal(
    resumeDate('Обновлено вчера в 09:05', now),
    new Date(2026, 10, 11, 9, 5).getTime()
  );
  assert.equal(
    resumeDate('Updated 5 minutes ago', now),
    now.getTime() - 300000
  );
  assert.equal(resumeDate('Updated an hour ago', now), now.getTime() - 3600000);
  assert.equal(resumeDate('Обновлено только что', now), now.getTime());
  assert.equal(resumeDate('Updated 0 minutes ago', now), now.getTime());
  assert.equal(resumeDate('Updated February 29', new Date(2028, 0, 5)), null);
  assert.equal(
    resumeDate('Updated December 30', new Date(2027, 0, 5)),
    new Date(2026, 11, 30).getTime()
  );
  for (const text of [
    '31.02.2026',
    '12.13.2026',
    'Updated today at 25:15',
    'Raise in search',
    'x'.repeat(201),
  ]) {
    assert.equal(resumeDate(text, now), null);
  }
});

test('resume snapshots bind slot/URL/unique identities and project out private state', () => {
  const raw = resumeListFixture();
  const list = resumeList({ ...raw, account: { secret: 'private' } });
  assert.equal(Object.hasOwn(list, 'account'), false);
  assert.equal(list.entries[0].url, 'https://hh.ru/resume/english');
  for (const invalid of [
    { ...raw, url: 'https://hh.ru/account/login' },
    { ...raw, observed: false },
    { ...raw, challenge: true },
    { ...raw, capturedAt: 'invalid' },
    { ...raw, entries: [raw.entries[0], raw.entries[0]] },
    { ...raw, entries: [{ ...raw.entries[0], hash: 'bad/hash' }] },
    { ...raw, entries: [{ ...raw.entries[0], updatedAt: 'yesterday' }] },
    { ...raw, entries: [{ ...raw.entries[0], title: '' }] },
    { ...raw, entries: Array(101).fill(raw.entries[0]) },
  ]) {
    assert.throws(() => resumeList(invalid));
  }
  assert.throws(() => resumeList(raw, 'other'));
});

test('a failed resume refresh preserves the successful slot cache across service restart', async () => {
  const store = createMemoryStore();
  let raw = resumeListFixture();
  const service = createVacancyService({ store, readResumes: async () => raw });
  try {
    const first = await service.resumes({});
    assert.equal(first.selection.hash, 'russian-new');
    raw = { ...raw, observed: false };
    await assert.rejects(service.resumes({}));
    assert.equal(
      (await service['resumes-stored']()).lists[0].entries.length,
      3
    );
  } finally {
    await service.stop();
  }
  const reopened = createVacancyService({
    store,
    readResumes: () => {
      throw new Error('must not resume');
    },
  });
  try {
    assert.equal(
      (await reopened['resumes-stored']()).lists[0].entries.length,
      3
    );
  } finally {
    await reopened.stop();
  }
});

test(
  'resume cancellation drains late launches and shares ownership with search',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const entered = gate(),
      release = gate();
    const events = [];
    const service = createVacancyService({
      store,
      openSession: async () => {
        entered.resolve();
        await release.promise;
        return fakeVacancySession(resumeListFixture(), events);
      },
    });
    try {
      const work = assert.rejects(service.resumes({}), {
        code: 'assignment-stopped',
      });
      await entered.promise;
      await assert.rejects(service.search({}), { code: 'jobs-busy' });
      let stopped = false;
      const stop = service.cancel().then(() => {
        stopped = true;
      });
      await Promise.resolve();
      assert.equal(stopped, false);
      release.resolve();
      await Promise.all([stop, work]);
      assert.deepEqual(events, ['closed']);
      assert.deepEqual(await service['resumes-stored'](), { lists: [] });
    } finally {
      release.resolve();
      await service.stop();
    }
  }
);

test('resume reader honors headed policy, exact page identity and close on refusal', async () => {
  const calls = [];
  const reader = createResumeListReader({
    store: {},
    openSession: async (options) => {
      calls.push(options);
      return fakeVacancySession(
        {
          ...resumeListFixture('personal'),
          url: 'https://hh.ru/account/login',
        },
        calls
      );
    },
  });
  await assert.rejects(reader({ browserSlot: 'personal', headless: false }), {
    code: 'jobs-resumes-unavailable',
  });
  assert.equal(calls[0].useCase, 'jobs');
  assert.equal(calls[0].headless, false);
  assert.equal(calls.at(-1), 'closed');
});

test('resume API rejects wrong-slot/selection receipts and validates offline caches without reads', async () => {
  const store = createMemoryStore();
  const service = createVacancyService({
    store,
    readResumes: async () => resumeListFixture(),
  });
  let receipt = await service.resumes({});
  const api = createVacancyApi({
    get: async () => null,
    report: async () => receipt,
    local: async () => store,
  });
  try {
    assert.equal((await api.vacancyResumes({})).selection.hash, 'russian-new');
    receipt = {
      ...receipt,
      selection: { ...receipt.selection, hash: 'english' },
    };
    await assert.rejects(api.vacancyResumes({}), { code: 'jobs-unconfirmed' });
    await assert.rejects(api.vacancyResumes({ browserSlot: 'wrong' }));
    assert.equal(
      (await api.vacancyResumesStored()).lists[0].url,
      HH_RESUMES_URL
    );
    await store.put({
      ...resumeListFixture(),
      id: 'jobs-resumes:wrong',
      version: 1,
    });
    await assert.rejects(api.vacancyResumesStored(), {
      code: 'jobs-resumes-cache-invalid',
    });
  } finally {
    await service.stop();
  }
});
