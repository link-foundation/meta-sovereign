import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { createMemoryStore } from '../src/storage/universal.js';
import { openDualStore } from '../src/storage/dual-store.js';
import {
  configuredResume,
  saveConfiguredResume,
  deleteConfiguredResume,
  withConfiguredResume,
  FORM_RESUME_ID,
} from '../src/forms/configured-resume.js';
import { portableResumePdf } from '../src/forms/resume-data.js';
import { resumePdf } from '../src/forms/resume-upload.js';
import { syntheticResumePdf } from '../../experiments/issue-56/forms-resume-fixture.mjs';
import { createFormsCommands } from '../src/cli/forms-commands.js';

const file = {
  name: 'synthetic-resume.pdf',
  data: syntheticResumePdf().toString('base64'),
};

test(
  'configured PDF survives dual-store reopen with metadata-only status and optimistic save/delete',
  { timeout: 10000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ms-form-resume-'));
    let store;
    try {
      store = await openDualStore(directory);
      assert.equal(await configuredResume(store), null);
      const saved = (await saveConfiguredResume(store, { file })).resume;
      assert.deepEqual(await portableResumePdf(file), resumePdf(file).metadata);
      assert(!JSON.stringify(saved).includes(file.data));
      await store.close();
      store = await openDualStore(directory);
      assert.deepEqual(await configuredResume(store), saved);
      await assert.rejects(saveConfiguredResume(store, { file }), {
        code: 'form-resume-changed',
      });
      await assert.rejects(deleteConfiguredResume(store, {}), {
        code: 'form-resume-changed',
      });
      const next = (
        await saveConfiguredResume(store, { file, revision: saved.revision })
      ).resume;
      assert.notEqual(next.revision, saved.revision);
      await assert.rejects(
        deleteConfiguredResume(store, { revision: saved.revision }),
        { code: 'form-resume-changed' }
      );
      await deleteConfiguredResume(store, next);
      assert.equal(await store.get(FORM_RESUME_ID), null);
    } finally {
      await store?.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test(
  'configured PDF replacement waits for an issued attachment; failed operations release the writer',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const saved = (await saveConfiguredResume(store, { file })).resume;
    let release;
    let entered;
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const upload = withConfiguredResume(
      store,
      saved.revision,
      async (selected) => {
        assert.deepEqual(selected, file);
        entered();
        await gate;
        return 'receipt';
      }
    );
    await ready;
    let replaced = false;
    const replacement = saveConfiguredResume(store, {
      file: { ...file, name: 'next.pdf' },
      revision: saved.revision,
    }).then((value) => {
      replaced = true;
      return value;
    });
    try {
      await setImmediate();
      assert.equal(replaced, false);
    } finally {
      release();
    }
    assert.equal(await upload, 'receipt');
    const next = await replacement;
    await assert.rejects(
      withConfiguredResume(store, saved.revision, () => assert.fail()),
      { code: 'form-resume-changed' }
    );
    await assert.rejects(
      withConfiguredResume(store, next.resume.revision, () => {
        throw new Error('fixture failure');
      }),
      /fixture failure/
    );
    await deleteConfiguredResume(store, next.resume);
    assert.equal(await configuredResume(store), null);
  }
);

test(
  'CLI configures one bounded local PDF and status/delete disclose only metadata',
  { timeout: 5000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ms-form-resume-cli-'));
    const store = createMemoryStore();
    const output = [];
    const command = createFormsCommands({ openStore: async () => store })[
      'forms-resume'
    ];
    const log = (line) => output.push(JSON.parse(line));
    try {
      const path = join(directory, file.name);
      await writeFile(path, syntheticResumePdf());
      await command({ action: 'save', file: path }, log);
      await command({}, log);
      assert.deepEqual(output[0], output[1]);
      assert(!JSON.stringify(output).includes(file.data));
      await assert.rejects(command({ action: 'delete' }, log), {
        code: 'form-resume-changed',
      });
      await command(
        { action: 'delete', revision: output[0].resume.revision },
        log
      );
      assert.equal(output.at(-1).resume, null);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
