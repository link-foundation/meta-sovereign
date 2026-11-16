import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented, parseIndented } from 'lino-objects-codec';
import { runnerProfileOperation } from '../src/server/runner-profile-store.js';
import { createRunnerController } from '../src/server/runner-controller.js';
import {
  runnerProfile,
  runnerFixture,
} from '../../experiments/issue-56/runner-fixture.mjs';

const documentFor = (profile = runnerProfile()) =>
  formatIndented({ id: 'runner', obj: profile });
const temporary = async (work) => {
  const dir = await mkdtemp(join(tmpdir(), 'runner-profile-'));
  try {
    await work(dir, join(dir, 'runner.lino'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
const read = (file) => runnerProfileOperation(file, { action: 'profile' });
const save = (file, document, revision, write) =>
  runnerProfileOperation(
    file,
    { action: 'configure', document, revision },
    write
  );

test(
  'missing profile reads canonical empty defaults; a durable private save returns the persisted revision',
  { timeout: 5000 },
  () =>
    temporary(async (_dir, file) => {
      const empty = await read(file);
      assert.deepEqual(parseIndented({ text: empty.document }).obj, {
        session: 'meta-sovereign-bot',
      });
      const saved = await save(file, documentFor(), empty.revision);
      assert.deepEqual(await read(file), saved);
      assert.equal(await readFile(file, 'utf8'), saved.document);
      assert.equal(
        parseIndented({ text: saved.document }).obj.server.node,
        'node'
      );
      if (process.platform !== 'win32') {
        assert.equal((await stat(file)).mode & 0o777, 0o600);
      }
    })
);

test(
  'profile conflicts, malformed data, bounded multibyte input and failed writes preserve the saved file',
  { timeout: 5000 },
  () =>
    temporary(async (_dir, file) => {
      await writeFile(file, documentFor());
      const before = await read(file);
      const changed = runnerProfile();
      changed.server.host = 'next@example.invalid';
      const saved = await save(file, documentFor(changed), before.revision);
      assert.deepEqual(await save(file, before.document, before.revision), {
        ok: false,
        code: 'runner-profile-conflict',
      });
      for (const document of [
        'runner:\n  local too many values\n',
        '界'.repeat(21846),
        documentFor({ ...changed, password: 'PRIVATE' }),
        documentFor({ local: { ...changed.local, directory: 'relative' } }),
      ]) {
        await assert.rejects(save(file, document, saved.revision), {
          code: 'INVALID_RUNNER_PROFILE',
        });
      }
      await assert.rejects(
        save(file, before.document, saved.revision, async () => {
          throw new Error('disk-full');
        }),
        /disk-full/
      );
      assert.deepEqual(await read(file), saved);
      const abort = new AbortController();
      abort.abort();
      await assert.rejects(
        runnerProfileOperation(file, {
          action: 'configure',
          document: before.document,
          revision: saved.revision,
          signal: abort.signal,
        })
      );
      assert.deepEqual(await read(file), saved);
    })
);

test(
  'controller serializes profile revisions and retains a running old address through reconfiguration',
  { timeout: 5000 },
  () =>
    temporary(async (dir, file) => {
      await writeFile(file, documentFor());
      const backend = runnerFixture();
      const addresses = [];
      const controller = createRunnerController({
        directory: () => dir,
        run: (target, ...args) => {
          addresses.push(target.host);
          return backend.run(target, ...args);
        },
      });
      const before = await controller.execute({ action: 'profile' });
      assert.deepEqual(backend.calls, []);
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'server' })).ok,
        true
      );
      backend.calls.length = 0;
      addresses.length = 0;
      const changed = runnerProfile();
      changed.server.host = 'next@example.invalid';
      const input = {
        action: 'configure',
        document: documentFor(changed),
        revision: before.revision,
      };
      const competing = await Promise.allSettled([
        controller.execute(input),
        controller.execute(input),
      ]);
      assert.equal(
        competing.filter(
          (result) => result.status === 'fulfilled' && result.value.ok
        ).length,
        1
      );
      assert.ok(
        competing.some((result) =>
          result.status === 'rejected'
            ? result.reason.code === 'STORE_LOCKED'
            : result.value.code === 'runner-profile-conflict'
        )
      );
      assert.deepEqual(backend.calls, []);
      const observed = await controller.execute({ action: 'status' });
      assert.equal(observed.code, 'runner-profile-change-blocked');
      assert.equal(observed.states.server, 'running');
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'local' })).ok,
        false
      );
      assert.equal(
        (await controller.execute({ action: 'stop', mode: 'server' })).ok,
        true
      );
      assert.ok(
        addresses
          .filter(Boolean)
          .every((host) => host === 'fixture@example.invalid')
      );
      addresses.length = 0;
      assert.equal(
        (await controller.execute({ action: 'start', mode: 'server' })).ok,
        true
      );
      assert.ok(addresses.includes('next@example.invalid'));
    })
);
