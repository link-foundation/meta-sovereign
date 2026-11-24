import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';
import { requestRunner } from '../../js/src/cli/runner-client.js';
import { readStoreLockState } from '../../js/src/storage/store-lock.js';
import { LINO_BINARY, readWireResponse } from '../../js/src/transport/lino.js';

export const availableLoopbackPort = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
};

/** This profile belongs to the packaged test's temporary working directory. */
export const stagePackagedRunner = async (directory) => {
  const profile = join(directory, '.meta-sovereign');
  const store = join(directory, 'runner-store');
  const port = await availableLoopbackPort();
  await mkdir(profile);
  await writeFile(
    join(profile, 'runner.lino'),
    formatIndented({
      id: 'runner',
      obj: { local: { isolation: 'desktop', store, port } },
    }),
    { mode: 0o600 }
  );
  return { store, origin: `http://127.0.0.1:${port}` };
};

export const verifyPackagedRunner = async (url, fixture) => {
  const request = (action, mode) =>
    requestRunner({
      url,
      action,
      mode,
      signal: globalThis.AbortSignal.timeout(85000),
    });
  assert.equal((await request('status')).states.local, 'stopped');
  assert.equal((await request('start', 'local')).ok, true);
  assert.equal(await readStoreLockState(fixture.store), 'held');
  const health = await fetch(`${fixture.origin}/api/health`, {
    headers: { accept: LINO_BINARY },
    signal: globalThis.AbortSignal.timeout(5000),
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('content-type')?.split(';')[0], LINO_BINARY);
  assert.equal((await readWireResponse(health)).store.degraded, false);
  const inspection = await request('inspect', 'local');
  assert.deepEqual(inspection.application, { mode: 'local', state: 'ready' });
};

export const verifyPackagedRunnerClosed = async (fixture) => {
  assert.equal(await readStoreLockState(fixture.store), 'free');
  await assert.rejects(
    fetch(`${fixture.origin}/api/health`, {
      signal: globalThis.AbortSignal.timeout(5000),
    })
  );
};
