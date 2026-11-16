import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { setImmediate } from 'node:timers';
import {
  createExperienceState,
  experienceExportKey,
} from '../src/web/cv-experience-state.js';
import { createExperienceApi } from '../src/web/cv-experience-api.js';
import { CvExperienceDocumentsScreen } from '../src/web/cv-experience-documents.js';
import { createMemoryStore } from '../src/storage/index.js';
import {
  saveExperienceDocument,
  storedExperienceDocuments,
  storedExperienceDocument,
  compareStoredExperience,
} from '../src/cv/experience-store.js';
import { experienceDocumentToLino } from '../src/cv/experience-document.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { experienceDocumentFixture } from '../../experiments/issue-56/experience-document-fixture.mjs';
import { renderInLocale } from './util-render.js';

const setup = () => {
  const store = createMemoryStore();
  const api = {
    cvExperienceStored: () => storedExperienceDocuments(store),
    cvExperienceExports: async () => ({ exports: [] }),
    cvExperienceImport: ({ document }) =>
      saveExperienceDocument(store, document),
    cvExperienceDocument: (revision) =>
      storedExperienceDocument(store, revision),
    cvExperienceCompare: (input) => compareStoredExperience(store, input),
  };
  const updates = [],
    downloads = [];
  const state = createExperienceState(
    api,
    (value) => updates.push(value),
    (...args) => downloads.push(args)
  );
  return { store, api, state, updates, downloads };
};
const file = (platform, type) => {
  const data =
    type === 'json'
      ? JSON.stringify(experienceDocumentFixture(platform))
      : experienceDocumentToLino(experienceDocumentFixture(platform), type);
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return {
    name: `experience.${type === LINO_BINARY ? 'bin' : type === 'json' ? 'json' : 'lino'}`,
    size: bytes.length,
    arrayBuffer: async () => bytes.slice().buffer,
  };
};

test('browser state imports JSON and both Lino files, compares exact revisions and downloads original metadata', async () => {
  for (const type of ['json', LINO_TEXT, LINO_BINARY]) {
    const { state, downloads } = setup();
    assert.equal(await state.reload(), true);
    for (const platform of ['hh', 'linkedin']) {
      const chosen = file(platform, type);
      state.file(chosen);
      assert.equal(await state.import(), true);
      assert.equal(state.get().file, chosen);
      assert.equal(state.get().receipt.document.platform, platform);
      for (const output of [LINO_TEXT, LINO_BINARY]) {
        assert.equal(await state.download(platform, output), true);
        assert.deepEqual(
          downloads.at(-1)[0],
          experienceDocumentFixture(platform)
        );
        assert.equal(downloads.at(-1)[2], output);
      }
    }
    assert.equal(await state.compare(), true);
    assert.equal(state.get().comparison.hh, state.get().choices.hh);
    assert.deepEqual(
      state.get().comparison.comparison.pairs[0].left.native,
      experienceDocumentFixture().jobs[0].native
    );
    state.choose('hh', '');
    assert.equal(state.get().comparison, null);
    state.dispose();
  }
});
test('failed reads and imports preserve acknowledged entries, chosen file and selections; repeated clicks are not replayed', async () => {
  const { state, api } = setup();
  await state.reload();
  const chosen = file('hh', LINO_TEXT);
  state.file(chosen);
  await state.import();
  const before = state.get();
  let finish;
  let calls = 0;
  api.cvExperienceImport = async () => {
    calls++;
    await new Promise((resolve) => {
      finish = resolve;
    });
    throw new Error('refused');
  };
  const pending = state.import();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.get().busy, true);
  assert.equal(await state.import(), false);
  state.choose('hh', '');
  finish();
  assert.equal(await pending, false);
  assert.equal(calls, 1);
  assert.equal(state.get().file, chosen);
  assert.deepEqual(state.get().choices, before.choices);
  api.cvExperienceStored = async () => {
    throw new Error('offline');
  };
  assert.equal(await state.reload(), false);
  assert.deepEqual(state.get().entries, before.entries);
  assert.equal(state.get().error, true);
  assert.equal(state.get().busy, false);
});
test('HH selection reuses only the exact acknowledged export; mismatched download and compare replies are refused', async () => {
  const { state, api, downloads } = setup();
  const native = {
    browserSlot: 'jobs',
    exportId: 'receipt-id',
    hash: 'resume-id',
    title: 'Example',
    language: 'en',
  };
  api.cvExperienceExports = async () => ({ exports: [native] });
  let input;
  api.cvExperienceFromHh = async (value) => {
    input = value;
    return saveExperienceDocument(
      createMemoryStore(),
      experienceDocumentFixture(),
      { kind: 'hh-export' }
    );
  };
  await state.reload();
  state.exportKey('unknown');
  assert.equal(await state.fromHh(), false);
  assert.equal(input, undefined);
  state.exportKey(experienceExportKey(native));
  assert.equal(await state.fromHh(), true);
  assert.deepEqual(input, {
    browserSlot: 'jobs',
    exportId: 'receipt-id',
    hash: 'resume-id',
  });
  api.cvExperienceDocument = () =>
    saveExperienceDocument(
      createMemoryStore(),
      experienceDocumentFixture('linkedin')
    );
  assert.equal(await state.download('hh', LINO_TEXT), false);
  assert.equal(downloads.length, 0);
  state.choose('linkedin', 'b'.repeat(64));
  api.cvExperienceCompare = async () => ({
    hh: 'a'.repeat(64),
    linkedin: 'b'.repeat(64),
    comparison: { status: 'compared' },
  });
  assert.equal(await state.compare(), false);
  assert.equal(state.get().comparison, null);
});
test('oversized file refuses before reading and disposed views do not publish late state', async () => {
  const { state, api, updates } = setup();
  let reads = 0;
  state.file({
    name: 'too-big.bin',
    size: 4 * 1024 * 1024 + 1,
    arrayBuffer: () => {
      reads++;
    },
  });
  assert.equal(await state.import(), false);
  assert.equal(reads, 0);
  let finish;
  api.cvExperienceStored = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const loading = state.reload();
  state.dispose();
  const count = updates.length;
  finish({ entries: [], truncated: false });
  await loading;
  assert.equal(updates.length, count);
  assert.equal(await state.reload(), false);
});
test('browser API refuses absent and error replies rather than inventing an empty catalogue or a saved snapshot', async () => {
  for (const value of [
    null,
    { error: 'refused' },
    { ok: false },
    { httpStatus: 403, code: 'forbidden' },
  ]) {
    const api = createExperienceApi({
      get: async () => value,
      report: async () => value,
    });
    for (const action of Object.values(api)) {
      await assert.rejects(action({}));
    }
  }
});
test('all locales render snapshot import, both downloads, retained errors and full revision receipt', async () => {
  const { state } = setup();
  state.file(file('hh', LINO_TEXT));
  await state.import();
  const data = { ...state.get(), error: true, truncated: true };
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    const html = renderInLocale(
      locale,
      React.createElement(CvExperienceDocumentsScreen, {
        state: data,
        actions: state,
      })
    );
    assert.doesNotMatch(html, /experienceFiles\./u);
    assert.match(html, /data-experience-file/);
    assert.match(html, /data-experience-action="download-hh-bin"/);
    assert.match(html, /data-experience-receipt="[a-f0-9]{64}"/u);
    assert.match(html, /role="alert"/);
    assert.doesNotMatch(
      html,
      /data-experience-action="(?:save|apply|publish)"/u
    );
  }
});
