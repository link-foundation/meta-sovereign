import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { launchPersistentBrowser } from '../src/cv/persistent-browser.js';
import { createReviewLifecycle } from '../src/forms/review-lifecycle.js';
import { createWatcherControl } from '../src/forms/watcher-rpc.js';
import {
  manageFormWatcher,
  listFormWatchers,
} from '../src/forms/watcher-management.js';
import { watcherDirectory, watcherFile } from '../src/forms/watcher-files.js';
import { createWatcherCore } from '../src/forms/watcher-core.js';
import { writeFileDurable } from '../src/storage/durable.js';
import { encodeWire, decodeWire } from '../src/transport/lino.js';

const fixture = async (run) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-form-watch-'));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

test(
  'persistent browser uses an isolated saved port, exact target identity and distinct detach/close operations',
  { timeout: 5000 },
  () =>
    fixture(async (profileDir) => {
      await fs.writeFile(
        path.join(profileDir, '.browser-commander-session.json'),
        JSON.stringify({ remoteDebuggingPort: 45678 })
      );
      const calls = [];
      const bc = {
        connectOrLaunch: async (options) => {
          calls.push(options);
          return {
            browser: {},
            cdpEndpoint: 'http://127.0.0.1:45678',
            page: {
              context: () => ({
                newCDPSession: async () => ({
                  send: async () => ({ targetInfo: { targetId: 'A123' } }),
                  detach: async () => calls.push('cdp-detach'),
                }),
              }),
            },
            detach: async () => calls.push('detach'),
            close: async () => calls.push('close'),
          };
        },
      };
      const session = await launchPersistentBrowser({
        bc,
        profileDir,
        headless: false,
        idleMs: 86400000,
        targetId: 'A123',
      });
      assert.equal(calls[0].userDataDir, profileDir);
      assert.equal(calls[0].targetId, 'A123');
      assert.equal(calls[0].remoteDebuggingPort, 45678);
      assert.equal(calls[0].headless, false);
      assert.equal(calls[0].idleTimeoutMs, 86400000);
      assert.equal(session.persistent.targetId, 'A123');
      await session.detach();
      assert(!calls.includes('close'));
      await session.close();
      assert(calls.includes('close'));
    })
);

test(
  'detaching an owned watcher drains its parent monitor and disconnects the controller; explicit Close stops learning and its browser',
  { timeout: 5000 },
  async () => {
    const calls = [];
    const record = (id, detached) => ({
      id,
      slot: id,
      state: 'open',
      monitor: { stop: async () => calls.push(`${id}:monitor`) },
      learning: {
        detached,
        stop: async () => calls.push(`${id}:stop`),
        detach: () => calls.push(`${id}:detach`),
        status: () => ({}),
        watcher: () => ({ state: 'active' }),
      },
      browser: {
        close: async () => calls.push(`${id}:close`),
        detach: async () => calls.push(`${id}:disconnect`),
      },
    });
    const records = new Map([
      ['watch', record('watch', true)],
      ['owned', record('owned', false)],
    ]);
    const owner = createReviewLifecycle({
      records,
      idleMs: 1000,
      deadlineMs: 1000,
      now: Date.now,
      timers: {
        clearTimeout: () => {},
        setTimeout: () => {
          throw new Error(
            'Detached ownership must use the watcher idle clock.'
          );
        },
      },
    });
    owner.touch(records.get('watch'));
    const result = await owner.detach();
    assert.equal(result.sessions[0].state, 'detached');
    assert.deepEqual(calls, [
      'watch:monitor',
      'watch:detach',
      'watch:disconnect',
      'owned:stop',
      'owned:monitor',
      'owned:close',
    ]);
    assert.equal(records.size, 0);
    const other = new Map([['explicit', record('explicit', true)]]);
    const lifecycle = createReviewLifecycle({
      records: other,
      idleMs: 1000,
      deadlineMs: 1000,
      now: Date.now,
      timers: globalThis,
    });
    await lifecycle.close('explicit');
    assert.deepEqual(calls.slice(-3), [
      'explicit:stop',
      'explicit:monitor',
      'explicit:close',
    ]);
  }
);

test(
  'watcher management operates without a knowledge writer and exposes public status without its authentication token',
  { timeout: 5000 },
  () =>
    fixture(async (directory) => {
      const watchDirectory = watcherDirectory(directory, 'form-1');
      const file = watcherFile(watchDirectory);
      const token = randomBytes(32).toString('hex');
      const control = await createWatcherControl({
        token,
        dispatch: async (operation) => {
          if (operation === 'stop') {
            await writeFileDurable(
              file,
              encodeWire({ ...metadata, state: 'stopped' })
            );
            return { ok: true, state: 'stopping' };
          }
          return {
            answerLearning: { state: 'waiting-plan', lifetime: 'detached' },
            watcher: { state: 'active' },
          };
        },
      });
      const metadata = {
        version: 1,
        pid: process.pid,
        port: control.port,
        token,
        state: 'active',
        slot: 'form-1',
        id: 'fixture',
      };
      await writeFileDurable(file, encodeWire(metadata));
      await writeFileDurable(
        path.join(watchDirectory, 'journal.lino'),
        encodeWire({
          ok: true,
          version: 1,
          mode: 'review-journal',
          checkpoints: [{ action: 'attach' }],
        })
      );
      try {
        const status = await manageFormWatcher({ directory, slot: 'form-1' });
        assert.equal(status.answerLearning.lifetime, 'detached');
        assert(!JSON.stringify(status).includes(token));
        assert.equal((await listFormWatchers(directory)).watchers.length, 1);
        const stopped = await manageFormWatcher({
          directory,
          slot: 'form-1',
          action: 'stop',
        });
        assert.equal(stopped.state, 'stopped');
        const history = await manageFormWatcher({
          directory,
          slot: 'form-1',
          action: 'history',
        });
        assert.equal(history.source, 'saved-checkpoints');
        assert.equal(history.state, 'stopped');
        assert.equal(history.checkpoints[0].action, 'attach');
        assert(!JSON.stringify(history).includes(token));
        assert.equal(
          (
            await manageFormWatcher({
              directory,
              slot: 'form-1',
              action: 'stop',
            })
          ).ok,
          true
        );
      } finally {
        await control.close();
      }
    })
);

test(
  'passive status reads cannot postpone the watcher idle limit and shutdown persists a bounded journal',
  { timeout: 5000 },
  () =>
    fixture(async (directory) => {
      const bindings = new Map();
      const page = {
        frames: () => [],
        addInitScript: async () => {},
        exposeBinding: async (name, callback) => bindings.set(name, callback),
      };
      let expired;
      const done = new Promise((resolve) => {
        expired = resolve;
      });
      const core = await createWatcherCore({
        session: { page },
        config: {
          id: 'fixture',
          slot: 'form-1',
          idleMs: 60,
          watchDirectory: directory,
        },
        finished: expired,
      });
      try {
        assert.equal(core.status().answerLearning.state, 'waiting-plan');
        for (const action of ['read', 'disclose', 'attach']) {
          await core.dispatch('checkpoint', {
            action,
            report: {
              fields: [],
              url: 'https://example.test/form',
              outcome: { state: `${action}-verified` },
            },
          });
        }
        await assert.rejects(
          core.dispatch('checkpoint', {
            action: 'submit',
            report: { fields: [] },
          }),
          /Invalid/
        );
        const history = await core.dispatch('history');
        assert.deepEqual(
          history.checkpoints.map(({ action }) => action),
          ['read', 'disclose', 'attach']
        );
        assert.equal(
          history.checkpoints[2].report.outcome.state,
          'attach-verified'
        );
        await core.dispatch('status');
        assert.equal(await done, 'idle-expired');
      } finally {
        await core.stop();
      }
      assert((await fs.stat(path.join(directory, 'journal.lino'))).size < 4096);
      const saved = decodeWire(
        await fs.readFile(path.join(directory, 'journal.lino'), 'utf8')
      );
      assert.equal(saved.checkpoints.length, 3);
    })
);
