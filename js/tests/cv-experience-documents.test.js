import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as cv from '../src/cv/index.js';
import { createMemoryStore } from '../src/storage/index.js';
import {
  saveExperienceDocument,
  storedExperienceDocuments,
  storedExperienceDocument,
} from '../src/cv/experience-store.js';
import { experienceFromHhExport } from '../src/cv/experience-hh.js';
import { privateSyncId } from '../src/sync/reconcile-records.js';
import { createCvCommands } from '../src/cli/cv-commands.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { experienceDocumentFixture } from '../../experiments/issue-56/experience-document-fixture.mjs';
import {
  technologyFixture,
  technologyCv,
} from '../../experiments/issue-56/technology-fixture.mjs';

test('full original workplace metadata round trips through public CV interchange in both Lino formats', () => {
  assert.equal(typeof cv.experienceDocumentToLino, 'function');
  for (const platform of ['hh', 'linkedin']) {
    const document = experienceDocumentFixture(platform);
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const restored = cv.experienceDocumentFromLino(
        cv.experienceDocumentToLino(document, type),
        type
      );
      assert.deepEqual(restored, document);
      restored.jobs[0].native.industries[0].name = 'Changed';
      assert.equal(
        document.jobs[0].native.industries[0].name,
        'Software Development'
      );
    }
  }
});
test('documents reject unsafe identity, malformed dates, accessors and bounded oversized inputs', () => {
  for (const patch of [
    { platform: 'unsupported' },
    { version: 2 },
    { profile: [] },
    {
      source: {
        ...experienceDocumentFixture().source,
        url: `https://hh.ru.attacker.test/resume/${'a'.repeat(40)}`,
      },
    },
    {
      source: {
        ...experienceDocumentFixture().source,
        url: `https://owner:password@hh.ru/resume/${'a'.repeat(40)}`,
      },
    },
    { jobs: [{ company: 'Example', start: '2026-13' }] },
  ]) {
    assert.throws(() =>
      cv.validateExperienceDocument({
        ...experienceDocumentFixture(),
        ...patch,
      })
    );
  }
  let reads = 0;
  const document = experienceDocumentFixture();
  Object.defineProperty(document.profile, 'unsafe', {
    enumerable: true,
    get() {
      reads++;
      return 'secret';
    },
  });
  assert.throws(() => cv.validateExperienceDocument(document));
  assert.equal(reads, 0);
  assert.throws(() =>
    cv.experienceDocumentFromLino(
      new Uint8Array(4 * 1024 * 1024 + 1),
      LINO_BINARY
    )
  );
});
test('acknowledged immutable imports stay private, deduplicate reordered keys and retain original metadata', async () => {
  const store = createMemoryStore();
  const document = experienceDocumentFixture();
  const first = await saveExperienceDocument(store, document);
  const reordered = Object.fromEntries(Object.entries(document).reverse());
  assert.equal(
    (await saveExperienceDocument(store, reordered)).revision,
    first.revision
  );
  assert.equal((await store.query()).length, 1);
  assert.ok((await store.query()).every((row) => privateSyncId(row.id)));
  assert.equal((await storedExperienceDocuments(store)).entries[0].jobs, 1);
  const read = await storedExperienceDocument(store, first.revision);
  assert.deepEqual(read.document, document);
  assert.equal(read.provenance.kind, 'imported');
  assert.equal(read.providerSaved, undefined);
  await assert.rejects(storedExperienceDocument(store, '../escape'));
  const row = (await store.query())[0];
  await store.put({ ...row, document: { ...row.document, profile: {} } });
  await assert.rejects(storedExperienceDocument(store, first.revision));
});
test('readers wait for refused flush rollback and a later import can succeed', async () => {
  const store = createMemoryStore();
  let entered, release;
  const writing = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  store.flush = async () => {
    entered();
    await gate;
    throw new Error('disk refused');
  };
  const pending = saveExperienceDocument(store, experienceDocumentFixture());
  const refused = assert.rejects(pending, /disk refused/);
  await writing;
  let finished = false;
  const read = storedExperienceDocuments(store).then((value) => {
    finished = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  await refused;
  assert.deepEqual(await read, { entries: [], truncated: false });
  delete store.flush;
  assert.equal(
    (await saveExperienceDocument(store, experienceDocumentFixture()))
      .provenance.kind,
    'imported'
  );
});
test('HH conversion reuses verified native bytes, keeps archived metadata and derives only job-local skills', async () => {
  const original = technologyCv();
  original.jobs[0].areaId = '1';
  original.jobs[0].website = 'https://example.test/archived/path/';
  original.jobs[0].industries = [
    { id: '7.540', name: 'Software Development', parent: 'IT' },
  ];
  original.jobs[0].futureMetadata = { retained: true };
  const fixture = await technologyFixture({ cv: original });
  try {
    const result = await experienceFromHhExport(fixture, fixture.input);
    const job = result.document.jobs[0];
    assert.equal(result.provenance.kind, 'hh-export');
    assert.equal(job.description, job.native.description);
    assert.equal(job.title, job.native.position);
    assert.deepEqual(job.native, original.jobs[0]);
    assert.deepEqual(job.skills, ['npm', 'PostgreSQL']);
    assert.equal(job.skills.includes('JavaScript'), false);
    assert.equal(result.document.profile.language, 'en');
    assert.equal(
      (await experienceFromHhExport(fixture, fixture.input)).revision,
      result.revision
    );
    await writeFile(path.join(fixture.folder, 'resume.json'), '{}');
    await assert.rejects(experienceFromHhExport(fixture, fixture.input));
    assert.equal(
      (await storedExperienceDocuments(fixture.store)).entries.length,
      1
    );
  } finally {
    await fixture.close();
  }
});
test('CLI admits typed Lino import and exports the exact document without invoking provider readers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-experience-cli-'));
  const store = createMemoryStore();
  const commands = createCvCommands({ openStore: async () => store });
  try {
    for (const [type, suffix] of [
      [LINO_TEXT, 'lino'],
      [LINO_BINARY, 'bin'],
    ]) {
      const file = path.join(dir, `experience.${suffix}`);
      await writeFile(
        file,
        cv.experienceDocumentToLino(experienceDocumentFixture(), type)
      );
      const output = [];
      assert.equal(
        await commands['cv-experience-import']({ file }, (line) =>
          output.push(line)
        ),
        0
      );
      const { revision } = JSON.parse(output[0]);
      const exported = [];
      assert.equal(
        await commands['cv-experience-export']({ revision }, (line) =>
          exported.push(line)
        ),
        0
      );
      assert.deepEqual(
        cv.experienceDocumentFromLino(exported[0]),
        experienceDocumentFixture()
      );
    }
    assert.equal((await store.query()).length, 1);
    assert.equal(
      await commands['cv-experience-import'](
        { file: path.join(dir, 'missing') },
        () => {}
      ),
      1
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'CLI compares explicit private revisions and refuses swapped provider identities',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const commands = createCvCommands({ openStore: async () => store });
    const hh = await saveExperienceDocument(store, experienceDocumentFixture());
    const linkedin = await saveExperienceDocument(
      store,
      experienceDocumentFixture('linkedin')
    );
    const out = [];
    assert.equal(
      await commands['cv-experience-compare'](
        { hh: hh.revision, linkedin: linkedin.revision },
        (line) => out.push(line)
      ),
      0
    );
    const result = JSON.parse(out[0]);
    assert.equal(result.hh, hh.revision);
    assert.deepEqual(
      result.comparison.pairs[0].left.native,
      hh.document.jobs[0].native
    );
    const before = await store.query();
    assert.equal(
      await commands['cv-experience-compare'](
        { hh: linkedin.revision, linkedin: hh.revision },
        () => {}
      ),
      1
    );
    assert.deepEqual(await store.query(), before);
  }
);
