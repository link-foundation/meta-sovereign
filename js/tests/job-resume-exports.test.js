import test from 'node:test';
import { setImmediate } from 'node:timers';
const { Response } = globalThis;
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { resumePeriod } from '../src/jobs/resume-dates.js';
import { resumeExportOptions } from '../src/jobs/resume-export-options.js';
import {
  sanitizedResumeCv,
  resumeCvLino,
  resumeCvFromLino,
  resumeCvText,
} from '../src/jobs/resume-cv.js';
import {
  industryDirectory,
  resolveResumeIndustry,
  loadResumeIndustries,
} from '../src/jobs/industries.js';
import { createVacancyService } from '../src/jobs/service.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { resumeExportResult } from '../src/jobs/resume-export-result.js';
import {
  resumeCvFixture,
  resumeIndustriesFixture,
  resumeExportReceipt,
} from '../../experiments/issue-56/resume-export-fixture.mjs';
import { gate } from '../../experiments/issue-56/vacancy-fixture.mjs';

test('native export options and bilingual employment periods retain explicit precision', () => {
  assert.deepEqual(resumeExportOptions({ formats: ['doc'] }).formats, [
    'doc',
    'html',
  ]);
  for (const input of [
    { all: 'yes' },
    { all: true, resume: 'english' },
    { formats: [] },
    { formats: ['txt'] },
    { formats: ['pdf', 'pdf'] },
    { resume: '../private' },
  ]) {
    assert.throws(() => resumeExportOptions(input));
  }
  for (const [period, start, end, current] of [
    ['Май 2020 — настоящее время', '2020-05', null, true],
    ['January 2019 – December 2020', '2019-01', '2020-12', false],
    ['2010 - 2012', '2010', '2012', false],
    ['Unknown', null, null, false],
  ]) {
    assert.deepEqual(resumePeriod(period), { start, end, current });
  }
});

test('Russian and English derived CVs remove private fields and prose while preserving company metadata and Lino values', () => {
  for (const language of ['ru', 'en']) {
    const raw = resumeCvFixture(language);
    raw.jobs[0].description +=
      '\nQuotes " and slash \\ and Unicode: \u4f60\u597d';
    const { cv, sanitization } = sanitizedResumeCv(raw);
    assert.deepEqual(sanitization, {
      removedLines: 5,
      kinds: ['birth-date', 'email', 'messenger', 'phone', 'salary'],
    });
    assert.equal(cv.about, 'Build reliable applications.');
    assert.deepEqual(cv.jobs[0].industries, raw.jobs[0].industries);
    assert.equal(cv.jobs[0].website, raw.jobs[0].website);
    assert.equal(cv.jobs[0].start, '2020-05');
    assert.deepEqual(resumeCvFromLino(resumeCvLino(cv)), cv);
    for (const output of [
      JSON.stringify(cv),
      resumeCvLino(cv),
      resumeCvText(cv),
      resumeCvText(cv, true),
    ]) {
      assert.doesNotMatch(
        output,
        /example\.test.*@|alex@example|private@example|20225550123|202\) 555|1990-01-01|\b100000\b|@private/u
      );
      assert.match(output, /7\.540/u);
      assert.match(output, /20200101000000/u);
    }
    assert.throws(
      () => sanitizedResumeCv({ ...raw, title: 'Contact alex@example.test' }),
      { code: 'jobs-resume-private' }
    );
  }
});

test('official industry labels resolve uniquely and the bounded localized cache never fetches on a fresh hit', async () => {
  const store = createMemoryStore();
  let reads = 0;
  const options = {
    store,
    language: 'ru',
    now: () => 100000,
    fetchImpl: async (url, request) => {
      reads++;
      assert.equal(url, 'https://api.hh.ru/industries?locale=RU');
      assert.equal(request.redirect, 'error');
      return new Response(JSON.stringify(resumeIndustriesFixture('ru')));
    },
  };
  const entries = await loadResumeIndustries(options);
  assert.equal(
    resolveResumeIndustry(
      { name: 'Программное обеспечение', parent: 'Технологии' },
      entries
    ).id,
    '7.540'
  );
  assert.deepEqual(await loadResumeIndustries(options), entries);
  assert.equal(reads, 1);
  assert.throws(() => resolveResumeIndustry({ name: 'Unknown' }, entries));
  assert.throws(() =>
    resolveResumeIndustry({ name: entries[0].name }, [...entries, entries[0]])
  );
  assert.throws(() =>
    industryDirectory([
      {
        id: '7',
        name: 'Test',
        industries: [{ id: '8.1', name: 'Wrong group' }],
      },
    ])
  );
  await assert.rejects(loadResumeIndustries({ ...options, language: 'xx' }));
  assert.equal(reads, 1);
  await assert.rejects(
    loadResumeIndustries({
      ...options,
      language: 'en',
      fetchImpl: async () =>
        new Response('x', {
          headers: { 'content-length': String(2 * 1024 ** 2 + 1) },
        }),
    })
  );
});

test(
  'durable export IDs recover completed or interrupted work without another browser operation',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const entered = gate(),
      release = gate();
    let reads = 0;
    const service = createVacancyService({
      store,
      readResumeExports: async (_options, progress) => {
        reads++;
        await progress({ total: 1 });
        entered.resolve();
        await release.promise;
        await progress({ result: resumeExportReceipt() });
      },
    });
    try {
      const input = { requestId: 'recoverable', formats: ['pdf'] };
      assert.equal((await service['resume-export'](input)).state, 'running');
      await entered.promise;
      assert.equal((await service['resume-export'](input)).state, 'running');
      await assert.rejects(
        service['resume-export']({ ...input, formats: ['rtf'] }),
        { code: 'jobs-export-conflict' }
      );
      await assert.rejects(service.search({}), { code: 'jobs-busy' });
      const reopened = createVacancyService({
        store,
        readResumeExports: async () => {
          throw new Error('No replay');
        },
      });
      try {
        assert.equal(
          (await reopened['resume-export-status'](input)).state,
          'interrupted'
        );
      } finally {
        await reopened.stop();
      }
      release.resolve();
      for (let i = 0; i < 100; i++) {
        const status = await service['resume-export-status'](input);
        if (status.state === 'completed') {
          break;
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal((await service['resume-export'](input)).state, 'completed');
      assert.equal(reads, 1);
    } finally {
      release.resolve();
      await service.stop();
    }
  }
);

test(
  'Stop waits for owned cleanup and retains previously verified exports',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const entered = gate(),
      cleanup = gate(),
      released = gate();
    const service = createVacancyService({
      store,
      readResumeExports: async ({ signal }, progress) => {
        await progress({ total: 2 });
        await progress({ result: resumeExportReceipt() });
        entered.resolve();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
        cleanup.resolve();
        await released.promise;
        signal.throwIfAborted();
      },
    });
    try {
      const input = { requestId: 'stop-owned', all: true };
      await service['resume-export'](input);
      await entered.promise;
      const stop = service.cancel();
      await cleanup.promise;
      assert.equal(
        (await service['resume-export-status'](input)).state,
        'running'
      );
      released.resolve();
      await stop;
      const job = await service['resume-export-status'](input);
      assert.equal(job.state, 'stopped');
      assert.equal(job.results.length, 1);
    } finally {
      released.resolve();
      await service.stop();
    }
  }
);

test('export API accepts terminal failures and refuses forged IDs, formats and file paths', async () => {
  const job = {
    requestId: 'failure',
    state: 'failed',
    total: 1,
    results: [],
    code: 'jobs-resume-content',
  };
  const api = createVacancyApi({
    report: async () => job,
    get: async () => job,
    fileUrl: async (url) => url,
  });
  assert.deepEqual(
    await api.vacancyResumeExport({ requestId: 'failure' }),
    job
  );
  assert.deepEqual(
    await api.vacancyResumeExportStatus({ requestId: 'failure' }),
    job
  );
  await assert.rejects(api.vacancyResumeExport({ requestId: 'wrong' }));
  const receipt = resumeExportReceipt();
  assert.match(
    await api.vacancyResumeExportUrl({ ...receipt, name: 'resume.lino' }),
    /resume-export-file/u
  );
  await assert.rejects(
    api.vacancyResumeExportUrl({ ...receipt, name: '../store.lino' })
  );
  assert.throws(() =>
    resumeExportResult({
      ...receipt,
      files: receipt.files.map((file) => ({ ...file, sha256: 'forged' })),
    })
  );
});

test('cancelling an unreceived export ID durably refuses late admission without owning another operation', async () => {
  const store = createMemoryStore();
  let reads = 0;
  const service = createVacancyService({
    store,
    readResumeExports: async () => {
      reads++;
    },
  });
  try {
    const input = { requestId: 'never-received' };
    const cancelled = await service['resume-export-cancel'](input);
    assert.equal(cancelled.state, 'stopped');
    assert.equal(
      (await service['resume-export']({ ...input, all: true })).state,
      'stopped'
    );
    assert.equal(reads, 0);
    assert.deepEqual(await service['resume-export-status'](input), cancelled);
  } finally {
    await service.stop();
  }
});

test('a cancellation flush failure stays uncertain until an explicit cancellation retry persists it', async () => {
  const store = createMemoryStore();
  let fail = true;
  store.flush = async () => {
    if (fail) {
      throw new Error('Disk unavailable');
    }
  };
  const service = createVacancyService({ store });
  const input = { requestId: 'cancel-durability' };
  try {
    await assert.rejects(
      service['resume-export-cancel'](input),
      /Disk unavailable/u
    );
    assert.equal(
      (await service['resume-export-status'](input)).state,
      'interrupted'
    );
    assert.equal((await service['resume-export'](input)).state, 'interrupted');
    fail = false;
    assert.equal(
      (await service['resume-export-cancel'](input)).state,
      'stopped'
    );
  } finally {
    await service.stop();
  }
});
