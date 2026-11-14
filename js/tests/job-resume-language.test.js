import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createVacancyService } from '../src/jobs/service.js';
import { chooseSearchResume, resumeList } from '../src/jobs/resume-list.js';
import { createVacancyApi } from '../src/web/vacancy-api.js';
import { resumeLanguageFixture } from '../../experiments/issue-56/resume-language-fixture.mjs';
import { resumeListFixture } from '../../experiments/issue-56/resume-list-fixture.mjs';

const fixture = async (work) => {
  const evidence = await resumeLanguageFixture();
  let raw = resumeListFixture();
  const service = createVacancyService({
    ...evidence,
    readResumes: async () => raw,
  });
  try {
    await work({
      ...evidence,
      service,
      update: (value) => {
        raw = value;
      },
    });
  } finally {
    await service.stop();
    await evidence.close();
  }
};

test('checked native export language outranks Latin titles without provider mutation', () =>
  fixture(async ({ service, store }) => {
    const result = await service.resumes({ resumeLanguage: 'ru' });
    assert.equal(result.selection.hash, 'english');
    assert.equal(result.selection.languageEvidence, 'native-export');
    assert.equal(result.entries[0].languageProof.language, 'ru');
    assert.equal(Object.hasOwn(result.entries[1], 'languageProof'), false);
    const cached = await store.get('jobs-resumes:jobs');
    assert.equal(JSON.stringify(cached).includes('languageProof'), false);
    assert.equal(JSON.stringify(result).includes('Built services'), false);
    // A known Russian export cannot masquerade as an English title hint.
    assert.equal(
      chooseSearchResume(result, { resumeLanguage: 'en' }).languageEvidence,
      'native-export'
    );
    assert.equal(
      chooseSearchResume(result, { resume: 'russian-old' }).hash,
      'russian-old'
    );
    assert.equal(
      chooseSearchResume(result, { resume: 'english' }).languageEvidence,
      'native-export'
    );
  }));

test('language evidence is rechecked on saved-list reads and after service restart', () =>
  fixture(async ({ service, store, artifactRoot }) => {
    await service.resumes({});
    const reopened = createVacancyService({
      store,
      artifactRoot,
      readResumes: () => {
        throw new Error('must not launch');
      },
    });
    try {
      const result = await reopened['resumes-stored']();
      assert.equal(result.lists[0].entries[0].languageProof.language, 'ru');
    } finally {
      await reopened.stop();
    }
    // Browser-only storage never upgrades a cached claim into checked evidence.
    await store.put({
      ...(await store.get('jobs-resumes:jobs')),
      entries: [
        {
          ...resumeListFixture().entries[0],
          languageProof: { language: 'en' },
        },
      ],
    });
    const offline = createVacancyApi({
      get: async () => null,
      local: async () => store,
    });
    assert.equal(
      Object.hasOwn(
        (await offline.vacancyResumesStored()).lists[0].entries[0],
        'languageProof'
      ),
      false
    );
  }));

test('new native dates, renamed or undated CVs invalidate historical language evidence', () =>
  fixture(async ({ service, update }) => {
    for (const change of [
      { updatedAt: Date.UTC(2026, 10, 12) },
      { title: 'Changed title' },
      { updatedAt: null, updatedText: '' },
    ]) {
      const raw = resumeListFixture();
      raw.entries[0] = { ...raw.entries[0], ...change };
      update(raw);
      const result = await service.resumes({});
      assert.equal(Object.hasOwn(result.entries[0], 'languageProof'), false);
      assert.equal(result.selection.languageEvidence, 'title-hint');
    }
  }));

test('other slots and unexported lists keep the disclosed title-only fallback', () =>
  fixture(async ({ service, update }) => {
    const empty = await service['resumes-stored']();
    assert.deepEqual(empty, { lists: [] });
    const result = resumeList(resumeListFixture('other'));
    assert.equal(chooseSearchResume(result).hash, 'russian-new');
    update(resumeListFixture('other'));
    const observed = await service.resumes({ browserSlot: 'other' });
    assert.equal(observed.selection.languageEvidence, 'title-hint');
    assert.equal(Object.hasOwn(observed.entries[0], 'languageProof'), false);
  }));

test('corrupted artifacts fail refresh and retain the last native list', () =>
  fixture(async ({ service, store, folder }) => {
    await service.resumes({});
    const before = await store.get('jobs-resumes:jobs');
    await writeFile(join(folder, 'resume.json'), 'tampered');
    await assert.rejects(service.resumes({}), {
      code: 'jobs-export-unconfirmed',
    });
    await assert.rejects(service['resumes-stored'](), {
      code: 'jobs-export-unconfirmed',
    });
    assert.deepEqual(await store.get('jobs-resumes:jobs'), before);
  }));

test('missing artifacts and wrong-slot receipts cannot establish language', () =>
  fixture(async ({ service, store, receipt, folder }) => {
    const id = `jobs-resume-export:jobs:${receipt.hash}`;
    await store.put({ id, version: 1, ...receipt, browserSlot: 'other' });
    await assert.rejects(service.resumes({}), {
      code: 'jobs-export-unconfirmed',
    });
    await store.put({ id, version: 1, ...receipt });
    await unlink(join(folder, 'resume.json'));
    await assert.rejects(service.resumes({}), {
      code: 'jobs-export-unconfirmed',
    });
    assert.equal(await store.get('jobs-resumes:jobs'), null);
  }));

test('latest and immutable export receipts must agree before using language', () =>
  fixture(async ({ service, store, receipt }) => {
    await store.put({
      id: `jobs-resume-export:jobs:${receipt.hash}`,
      version: 1,
      ...receipt,
      language: 'en',
    });
    await assert.rejects(service.resumes({}), {
      code: 'jobs-export-unconfirmed',
    });
    assert.equal(await store.get('jobs-resumes:jobs'), null);
  }));

test('portable language evidence is validated and selections are recomputed', () =>
  fixture(async ({ service }) => {
    let answer = await service.resumes({});
    const api = createVacancyApi({ report: async () => answer });
    assert.equal((await api.vacancyResumes({})).selection.hash, 'english');
    answer = {
      ...answer,
      selection: { ...answer.selection, hash: 'russian-new' },
    };
    await assert.rejects(api.vacancyResumes({}), { code: 'jobs-unconfirmed' });
    const valid = await service.resumes({});
    for (const change of [
      { language: 'xx' },
      { exportId: '../wrong' },
      { sha256: '0' },
      { updatedAt: 1 },
      { capturedAt: 'invalid' },
      { capturedAt: '2000-01-01' },
    ]) {
      answer = {
        ...valid,
        entries: valid.entries.map((row, i) =>
          i
            ? row
            : { ...row, languageProof: { ...row.languageProof, ...change } }
        ),
      };
      await assert.rejects(api.vacancyResumes({}), {
        code: 'jobs-resume-language',
      });
    }
  }));

test(
  'cancellation during export verification prevents cache publication',
  { timeout: 5000 },
  () =>
    fixture(async ({ service, store }) => {
      const original = store.get.bind(store);
      let release;
      let entered;
      const blocked = new Promise((resolve) => {
        release = resolve;
      });
      const observed = new Promise((resolve) => {
        entered = resolve;
      });
      store.get = async (id) => {
        if (id.startsWith('jobs-resume-export:')) {
          entered();
          await blocked;
        }
        return original(id);
      };
      const result = assert.rejects(service.resumes({}), {
        name: 'AbortError',
      });
      try {
        await observed;
        const cancelled = service.cancel();
        release();
        await Promise.all([cancelled, result]);
        assert.equal(await original('jobs-resumes:jobs'), null);
      } finally {
        release();
      }
    })
);
