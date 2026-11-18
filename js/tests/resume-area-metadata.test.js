import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  sanitizedResumeCv,
  resumeCvLino,
  resumeCvFromLino,
  resumeCvText,
} from '../src/jobs/resume-cv.js';
import {
  areaDirectory,
  loadResumeAreas,
  resolveResumeArea,
} from '../src/jobs/areas.js';
import { resumeExportContent } from '../src/jobs/resume-export-content.js';
import { readCvSavedExports } from '../src/jobs/cv-watch-export.js';
import { verifyCvSave } from '../src/jobs/cv-watch-verification.js';
import { cvWorkplaceJobValues } from '../src/jobs/cv-workplace-plan.js';
import { resumeCvFixture } from '../../experiments/issue-56/resume-export-fixture.mjs';
import { cvWorkplaceIdentityFixture } from '../../experiments/issue-56/cv-workplace-identity-fixture.mjs';
import { cvWorkplaceDictionaryRows } from '../../experiments/issue-56/cv-workplace-fields-fixture.mjs';

test('area identities survive sanitization, structured/Lino round trips and derived prose without changing older CVs', () => {
  const raw = resumeCvFixture();
  const legacy = sanitizedResumeCv(raw).cv;
  assert.equal(Object.hasOwn(legacy.jobs[0], 'areaId'), false);
  raw.jobs[0].areaId = '2';
  const { cv } = sanitizedResumeCv(raw);
  assert.equal(cv.jobs[0].areaId, '2');
  assert.deepEqual(resumeCvFromLino(resumeCvLino(cv)), cv);
  assert.deepEqual(JSON.parse(JSON.stringify(cv)), cv);
  assert.match(resumeCvText(cv), /HH area 2/u);
  assert.match(resumeCvText(cv, true), /HH area 2/u);
  assert.equal(cv.jobs[0].website, raw.jobs[0].website);
  for (const value of ['', 2, '-2', '2.1', '2/3', '1'.repeat(13)]) {
    assert.throws(() =>
      sanitizedResumeCv({ ...raw, jobs: [{ ...raw.jobs[0], areaId: value }] })
    );
  }
  assert.equal(
    sanitizedResumeCv({ ...raw, jobs: [{ ...raw.jobs[0], areaId: null }] }).cv
      .jobs[0].areaId,
    null
  );
});

test('the complete bounded area dictionary is cached by locale, rejects ambiguity, expires and honors cancellation', async () => {
  const store = createMemoryStore();
  let reads = 0;
  let now = 100000;
  const options = {
    store,
    language: 'en',
    now: () => now,
    fetchImpl: async (url, request) => {
      reads++;
      assert.equal(url, 'https://api.hh.ru/areas?locale=EN');
      assert.equal(request.credentials, 'omit');
      assert.equal(request.redirect, 'error');
      return new globalThis.Response(
        JSON.stringify([
          {
            id: '1',
            name: 'Country',
            areas: Array.from({ length: 250 }, (_, i) => ({
              id: String(i + 2),
              name: `City ${i}`,
              areas: [],
            })),
          },
        ])
      );
    },
  };
  const rows = await loadResumeAreas(options);
  assert.equal(rows.length, 251);
  assert.equal(resolveResumeArea('  CITY 249 ', rows).id, '251');
  assert.equal(resolveResumeArea('', rows), null);
  assert.deepEqual(await loadResumeAreas(options), rows);
  assert.equal(reads, 1);
  now += 86400000;
  await loadResumeAreas(options);
  assert.equal(reads, 2);
  await assert.rejects(loadResumeAreas({ ...options, language: 'hi' }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    loadResumeAreas({ ...options, signal: controller.signal })
  );
  assert.equal(reads, 2);
  assert.throws(() =>
    resolveResumeArea('Moscow', [
      { id: '2', name: 'Moscow' },
      { id: '3', name: 'Moscow' },
    ])
  );
  assert.throws(() => resolveResumeArea('Unknown', rows));
  assert.throws(() =>
    areaDirectory([
      {
        id: '1',
        name: 'One',
        areas: [{ id: '1', name: 'Duplicate', areas: [] }],
      },
    ])
  );
  assert.throws(() => areaDirectory([{ id: '1', name: 'One', areas: [null] }]));
});

const rawExport = (language) => {
  const raw = resumeCvFixture(language);
  raw.jobs[0].area = language === 'ru' ? 'Москва' : 'Moscow';
  return raw;
};

test('native conversion retains city ID, full industries, archived paths, About and technology prose in both languages', async () => {
  const store = createMemoryStore();
  for (const row of cvWorkplaceDictionaryRows()) {
    await store.put(row);
  }
  for (const language of ['ru', 'en']) {
    const raw = rawExport(language);
    raw.jobs[0].description += '\nTechnologies: JavaScript, SQL';
    const result = await resumeExportContent({ raw, store });
    assert.equal(result.cv.jobs[0].areaId, '2');
    assert.equal(result.cv.jobs[0].area, raw.jobs[0].area);
    assert.deepEqual(result.cv.jobs[0].industries, raw.jobs[0].industries);
    assert.equal(result.cv.jobs[0].website, raw.jobs[0].website);
    assert.match(
      result.cv.jobs[0].description,
      /Technologies: JavaScript, SQL/u
    );
    assert.deepEqual(result.cv.skills, raw.skills);
    assert.equal(result.cv.about, 'Build reliable applications.');
    assert.equal(result.rawCv.about, raw.about);
    assert.equal(result.cv.jobs[0].start, '2020-05');
    const calls = [];
    await resumeExportContent({
      raw: { ...raw, jobs: [] },
      store,
      fetchAreas: () => calls.push('area'),
      fetchIndustries: () => calls.push('industry'),
    });
    assert.deepEqual(calls, []);
    await assert.rejects(
      resumeExportContent({
        raw: { ...raw, jobs: [{ ...raw.jobs[0], area: 'Unknown region' }] },
        store,
      }),
      { code: 'jobs-areas-unavailable' }
    );
  }
});

test('fresh readback resolves the form locale and the export locale independently without navigation', async () => {
  const { attempt } = cvWorkplaceIdentityFixture();
  const store = createMemoryStore();
  const rows = cvWorkplaceDictionaryRows();
  for (const row of rows) {
    await store.put(row);
  }
  const raw = rawExport('ru');
  raw.observed = true;
  const calls = [];
  const session = {
    page: { url: () => 'https://hh.ru/resume/english' },
    commander: {
      evaluate: async ({ fn, args }) => {
        calls.push(fn.name);
        if (fn.name === 'fetchCvSavedHtml') {
          assert.equal(typeof args[0].hash, 'string');
          return '<html>inert saved export</html>';
        }
        return raw;
      },
    },
  };
  const result = await readCvSavedExports({
    session,
    store,
    attempt: { ...attempt, area: 'Moscow' },
    check: () => {},
  });
  assert.equal(result.length, 2);
  assert.equal(result[0].cv.jobs[0].areaId, '2');
  assert.equal(resolveResumeArea('Moscow', result[0].areaEntries).id, '2');
  assert.equal(resolveResumeArea('Москва', result[0].areaEntries).id, '2');
  assert.deepEqual(calls, [
    'fetchCvSavedHtml',
    'readResumeExportHtml',
    'fetchCvSavedHtml',
    'readResumeExportHtml',
  ]);
});

test('saved city verification compares official identities across languages and refuses another region or ambiguous labels', () => {
  const { attempt, job, exports } = cvWorkplaceIdentityFixture();
  const localized = { ...job, area: 'Лондон', areaId: '2' };
  const areaEntries = [
    { id: '2', name: 'London', parent: 'UK' },
    { id: '2', name: 'Лондон', parent: 'Великобритания' },
  ];
  const checked = (candidate = localized, entries = areaEntries) =>
    verifyCvSave(
      attempt,
      [
        { ...exports[0], cv: { jobs: [candidate] }, areaEntries: entries },
        exports[1],
      ],
      attempt
    );
  assert.equal(checked(), true);
  assert.equal(
    verifyCvSave(
      attempt,
      [{ ...exports[0], cv: { jobs: [localized] }, areaEntries }, exports[1]],
      { ...attempt, area: 'Лондон' }
    ),
    true
  );
  assert.equal(checked({ ...localized, areaId: '3' }), false);
  assert.equal(checked({ ...localized, area: 'Unknown region' }), false);
  assert.equal(
    checked(localized, [
      ...areaEntries,
      { id: '3', name: 'London', parent: 'Canada' },
    ]),
    false
  );
  assert.equal(checked(localized, []), false);
  assert.equal(verifyCvSave(attempt, exports, attempt), true);
  assert.equal(checked({ ...job, area: 'Лондон' }), false);
});

test('native preparation refuses a supplied area identity that conflicts with its verified dictionary mapping', () => {
  const job = sanitizedResumeCv(resumeCvFixture()).cv.jobs[0];
  assert.equal(cvWorkplaceJobValues({ ...job, areaId: '2' }, '2').areaId, '2');
  assert.throws(() => cvWorkplaceJobValues({ ...job, areaId: '3' }, '2'));
  assert.throws(() => cvWorkplaceJobValues({ ...job, areaId: null }, '2'));
  assert.equal(cvWorkplaceJobValues(job, '2').areaId, '2');
});
