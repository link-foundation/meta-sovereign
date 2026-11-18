import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import { openDualStore } from '../src/storage/dual-store.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { listAnswerRules } from '../src/automation/question-store.js';
import { writeAnswerKnowledge } from '../src/automation/question-knowledge.js';
import { saveAnswerPolicy } from '../src/automation/question-policy.js';
import {
  createFormKnowledgeBridge,
  formBridgeFile,
  requestFormKnowledge,
} from '../src/forms/knowledge-bridge.js';
import { saveWatchedFormAnswers } from '../src/forms/watch-store.js';

const pair = (
  question = 'Describe experience',
  text = 'I build reliable storage systems'
) => ({
  question,
  text,
  url: 'https://example.test/form',
  evidence: 'form:fixture',
  field: { type: 'textarea', label: question, name: 'experience' },
});
const fixture = async (run) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ms-form-watch-store-')
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

test(
  'an unlocked watcher closes its writer; an active store owner handles proposals without opening another writer',
  { timeout: 15000 },
  () =>
    fixture(async (directory) => {
      const first = await saveWatchedFormAnswers(directory, [pair()]);
      assert.equal(first.saved, 1);
      await assert.rejects(fs.stat(path.join(directory, 'data.lock')), {
        code: 'ENOENT',
      });
      const store = await openDualStore(directory);
      const bridge = await createFormKnowledgeBridge({ store, directory });
      let checks = 0;
      try {
        const result = await saveWatchedFormAnswers(
          directory,
          [pair('Other experience')],
          {
            check: () => {
              checks++;
            },
          },
          {
            openStore: () => {
              throw new Error('must use current owner');
            },
          }
        );
        assert.equal(result.saved, 1);
        assert.equal(
          checks,
          2,
          'checks both before reading current policy and before writing'
        );
        assert.equal((await listAnswerRules(store)).length, 2);
        assert.equal(
          (await listAnswerRules(store))[0].answers[0].approved,
          false
        );
        if (process.platform !== 'win32') {
          assert.equal(
            (await fs.stat(formBridgeFile(directory))).mode & 0o777,
            0o600
          );
        }
      } finally {
        await bridge.close();
        await store.close();
      }
    })
);

test(
  'a queued remote proposal uses current policy and checks the watcher again after the writer wait',
  { timeout: 10000 },
  () =>
    fixture(async (directory) => {
      const store = createMemoryStore();
      const bridge = await createFormKnowledgeBridge({ store, directory });
      let release;
      const held = writeAnswerKnowledge(
        store,
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      await setImmediate();
      const policy = saveAnswerPolicy(store, {
        rejected: ['I build reliable storage systems'],
      });
      let current = true;
      const pending = requestFormKnowledge(directory, process.pid, [pair()], {
        check: () => {
          if (!current) {
            throw new Error('live answer changed');
          }
        },
      });
      await setImmediate();
      current = false;
      release();
      try {
        await Promise.all([held, policy]);
        await assert.rejects(pending, { code: 'form-learning-changed' });
        assert.deepEqual(await listAnswerRules(store), []);
        const rejected = await requestFormKnowledge(directory, process.pid, [
          pair(),
        ]);
        assert.equal(rejected.saved, 0);
        assert.equal(rejected.skipped, 1);
      } finally {
        release();
        await held;
        await bridge.close();
      }
    })
);

test(
  'remote guard failure preserves confirmed partial counts, rejects excess pairs and closes reference-counted bridges once',
  { timeout: 10000 },
  () =>
    fixture(async (directory) => {
      const store = createMemoryStore();
      const one = await createFormKnowledgeBridge({ store, directory });
      const two = await createFormKnowledgeBridge({ store, directory });
      await Promise.all([one.close(), one.close()]);
      let checks = 0;
      try {
        await assert.rejects(
          requestFormKnowledge(
            directory,
            process.pid,
            [pair(), pair('Other experience')],
            {
              check: () => {
                if (++checks === 3) {
                  throw new Error('changed before second write');
                }
              },
            }
          ),
          (error) => {
            assert.equal(error.code, 'form-learning-changed');
            assert.equal(error.partial.saved, 1);
            assert.equal(error.partial.rules.length, 1);
            return true;
          }
        );
        assert.equal((await listAnswerRules(store)).length, 1);
        await assert.rejects(
          requestFormKnowledge(
            directory,
            process.pid,
            Array(1001).fill(pair())
          ),
          /capacity/
        );
        await assert.rejects(
          createFormKnowledgeBridge({ store: createMemoryStore(), directory }),
          /already active/
        );
      } finally {
        await Promise.all([two.close(), two.close()]);
      }
      await assert.rejects(fs.stat(formBridgeFile(directory)), {
        code: 'ENOENT',
      });
    })
);

test(
  'a live writer without a bridge stays locked and is never replaced by a watcher',
  { timeout: 10000 },
  () =>
    fixture(async (directory) => {
      const store = await openDualStore(directory);
      try {
        await assert.rejects(
          saveWatchedFormAnswers(
            directory,
            [pair()],
            {},
            {
              openStore: () => {
                throw new Error('must not open another writer');
              },
            }
          ),
          { code: 'form-store-busy' }
        );
        assert.deepEqual(await listAnswerRules(store), []);
      } finally {
        await store.close();
      }
    })
);

test(
  'simultaneous local watcher saves serialize their writer lifetimes without losing either proposal',
  { timeout: 15000 },
  () =>
    fixture(async (directory) => {
      const results = await Promise.all([
        saveWatchedFormAnswers(directory, [pair('First experience')]),
        saveWatchedFormAnswers(directory, [pair('Second experience')]),
      ]);
      assert.deepEqual(
        results.map((result) => result.saved),
        [1, 1]
      );
      const store = await openDualStore(directory, { readOnly: true });
      try {
        assert.equal((await listAnswerRules(store)).length, 2);
      } finally {
        await store.close();
      }
    })
);
