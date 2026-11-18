import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readAssignmentPage } from '../src/assignments/read-page.js';
import { createFormSessions } from '../src/forms/review-sessions.js';
import { createAutoImportManager } from '../src/sources/auto-import/manager.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createVacancyService } from '../src/jobs/service.js';

const bounded = { timeout: 5000 };
// Model an installer that acknowledges cancellation only after its child closes.
const heldPreparation = (t) => {
  const started = Promise.withResolvers();
  const drain = Promise.withResolvers();
  t.after(() => drain.resolve());
  return {
    started: started.promise,
    release: drain.resolve,
    open: async ({ signal }) => {
      started.resolve(signal);
      await drain.promise;
      throw new Error('Browser preparation stopped.');
    },
  };
};
const cancellation = async (signal) => {
  assert(signal, 'startup must receive its owning cancellation signal');
  if (!signal.aborted) {
    await new Promise((resolve) =>
      signal.addEventListener('abort', resolve, { once: true })
    );
  }
};
const drains = async (pending, fixture) => {
  let finished = false;
  const checked = pending.then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(
    finished,
    false,
    'owner must wait for actual installer drainage'
  );
  fixture.release();
  await checked;
};

for (const mode of ['stop', 'deadline']) {
  test(
    `assignment ${mode} cancels preparation and retains its original error`,
    bounded,
    async (t) => {
      const fixture = heldPreparation(t);
      const controller = new AbortController();
      const opening = readAssignmentPage({
        openSession: fixture.open,
        platform: 'hh',
        kind: 'vacancy',
        signal: controller.signal,
        deadlineMs: mode === 'deadline' ? 30 : 5000,
      });
      const checked = assert.rejects(opening, {
        code:
          mode === 'deadline'
            ? 'assignment-vacancy-timeout'
            : 'assignment-stopped',
      });
      t.after(() => checked);
      const ownedSignal = await fixture.started;
      assert(
        ownedSignal,
        'startup must receive its owning cancellation signal'
      );
      if (mode === 'stop') {
        controller.abort();
      }
      await cancellation(ownedSignal);
      await drains(checked, fixture);
    }
  );
}

test(
  'closing a form review cancels and drains pending browser preparation',
  bounded,
  async (t) => {
    const fixture = heldPreparation(t);
    const sessions = createFormSessions({
      store: createMemoryStore(),
      openSession: fixture.open,
    });
    t.after(() => sessions.stop());
    const opening = assert.rejects(
      sessions.open({ url: 'https://example.test/form' }),
      {
        code: 'form-session-closed',
      }
    );
    const signal = await fixture.started;
    assert(signal, 'startup must receive its owning cancellation signal');
    const closing = sessions.close(sessions.list().sessions[0].id);
    await cancellation(signal);
    await drains(closing, fixture);
    await opening;
    assert.equal(sessions.list().sessions.length, 0);
  }
);

test(
  'manual login shutdown cancels and drains pending browser preparation',
  bounded,
  async (t) => {
    const fixture = heldPreparation(t);
    const service = createVacancyService({
      store: createMemoryStore(),
      availability: async () => ({ available: true }),
      openSession: fixture.open,
    });
    t.after(() => service.stop());
    const opening = assert.rejects(
      service['login-open']({ requestId: 'first-use' })
    );
    const signal = await fixture.started;
    assert(signal, 'startup must receive its owning cancellation signal');
    const closing = service.stop();
    await cancellation(signal);
    await drains(closing, fixture);
    await opening;
  }
);

for (const mode of ['stop', 'close']) {
  test(
    `auto-import ${mode} drains preparation without overwriting its stopped state`,
    bounded,
    async (t) => {
      const fixture = heldPreparation(t);
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'ms-import-prepare-')
      );
      t.after(() => rm(directory, { recursive: true, force: true }));
      const manager = createAutoImportManager({
        store: createMemoryStore(),
        dataDir: directory,
        launcher: fixture.open,
      });
      t.after(() => manager.close());
      const job = manager.start('telegram');
      const signal = await fixture.started;
      assert(signal, 'startup must receive its owning cancellation signal');
      const closing = mode === 'stop' ? manager.stop(job.id) : manager.close();
      const again = manager.close();
      await cancellation(signal);
      await drains(Promise.all([closing, again]), fixture);
      assert.equal(
        manager.get(job.id).state,
        mode === 'stop' ? 'done' : 'stopped'
      );
      assert.equal(manager.get(job.id).error, null);
    }
  );
}
