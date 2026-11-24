/** Exercise the real utility worker and both Runner API codecs in Electron. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { formatIndented } from 'lino-objects-codec';
import { app, utilityProcess } from 'electron';
import { mkdtemp, rm } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDesktopLocalRunner } from '../../js/electron/local-runner.js';
import { readStoreLockState } from '../../js/src/storage/store-lock.js';
import { availableLoopbackPort } from './desktop-packaged-runner.mjs';
import {
  decodeWire,
  encodeWire,
  LINO_BINARY,
  LINO_TEXT,
  readWireResponse,
} from '../../js/src/transport/lino.js';

const request = async (origin, route, type, input) => {
  const response = await fetch(`${origin}/api/runner${route}`, {
    ...(input && { method: 'POST', body: encodeWire(input, type) }),
    headers: { accept: type, 'content-type': type },
    signal: globalThis.AbortSignal.timeout(35000),
  });
  assert.equal(response.status, 200);
  return readWireResponse(response);
};

const loadParentValidator = () => {
  const file = 'js/src/cli/runner-profile.js';
  const url = new URL(`../../${file}`, import.meta.url).href;
  const source = execFileSync('git', ['show', `27490251:${file}`]);
  registerHooks({
    load(specifier, context, next) {
      return specifier === url
        ? { format: 'module', source, shortCircuit: true }
        : next(specifier, context);
    },
  });
};

if (process.argv.includes('--parent')) {
  loadParentValidator();
}

const run = async () => {
  const { startServer } = await import('../../js/src/server/index.js');
  const { createRunnerCommand } =
    await import('../../js/src/cli/runner-command.js');
  const dir = await mkdtemp(join(tmpdir(), 'ms-desktop-runner-'));
  const ownership = join(dir, 'controller', 'runner-control', 'desktop');
  const store = join(dir, 'worker');
  app.setPath('userData', dir);
  await app.whenReady();
  const desktopRunner = createDesktopLocalRunner({
    utilityProcess: {
      fork: (entry, args, options) =>
        utilityProcess.fork(entry, args, { ...options, stdio: 'inherit' }),
    },
    ownershipDirectory: ownership,
  });
  let control;
  let phase = 'controller';
  try {
    control = await startServer({
      storeDir: join(dir, 'main'),
      port: 0,
      host: '127.0.0.1',
      localUi: true,
      tls: false,
      runnerSessions: {
        directory: () => join(dir, 'controller'),
        localDirectory: () => join(dir, 'local'),
        desktopRunner,
      },
    });
    const origin = `http://127.0.0.1:${control.port}`;
    const port = await availableLoopbackPort();
    const worker = `http://127.0.0.1:${port}`;
    const document = formatIndented({
      id: 'runner',
      obj: { local: { isolation: 'desktop', store, port } },
    });
    if (process.argv.includes('--serve')) {
      console.log(
        JSON.stringify({
          origin,
          document,
          workerOrigin: worker,
          pid: process.pid,
        })
      );
      await once(process, 'SIGTERM');
      return;
    }
    phase = 'configure';
    const previous = await request(origin, '/profile', LINO_TEXT);
    const saved = await request(origin, '/configure', LINO_BINARY, {
      revision: previous.revision,
      document,
    });
    assert.equal(saved.ok, true);
    assert.equal(
      (await request(origin, '/profile', LINO_TEXT)).document,
      saved.document
    );
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      phase = `start ${type}`;
      assert.equal((await request(origin, '', type)).states.local, 'stopped');
      assert.equal(await readStoreLockState(ownership), 'free');
      assert.equal(
        (await request(origin, '/start', type, { mode: 'local' })).states.local,
        'running'
      );
      assert.equal(await readStoreLockState(ownership), 'held');
      assert.equal(await readStoreLockState(store), 'held');
      phase = `inspect ${type}`;
      const health = await fetch(`${worker}/api/health`, {
        headers: { accept: type },
        signal: globalThis.AbortSignal.timeout(5000),
      });
      assert.equal(health.ok, true);
      const healthReceipt = await readWireResponse(health);
      assert.equal(healthReceipt.ok, true);
      assert.equal(healthReceipt.store.degraded, false);
      assert.equal(
        (await request(origin, '/inspect?mode=local', type)).application.state,
        'ready'
      );
      const output = [];
      assert.equal(
        await createRunnerCommand()(
          { _: ['inspect', 'local'], url: origin },
          (line) => output.push(line)
        ),
        0
      );
      assert.equal(decodeWire(output[0], LINO_TEXT).application.state, 'ready');
      phase = `stop ${type}`;
      assert.equal(
        (await request(origin, '/stop', type, { mode: 'local' })).states.local,
        'stopped'
      );
      assert.equal(await readStoreLockState(ownership), 'free');
      assert.equal(await readStoreLockState(store), 'free');
      await assert.rejects(
        fetch(`${worker}/api/health`, {
          signal: globalThis.AbortSignal.timeout(2500),
        })
      );
    }
    phase = 'owner shutdown';
    assert.equal(
      (await request(origin, '/start', LINO_TEXT, { mode: 'local' })).ok,
      true
    );
    await control.close();
    assert.equal(await readStoreLockState(ownership), 'free');
    assert.equal(await readStoreLockState(store), 'free');
    await assert.rejects(
      fetch(`${worker}/api/health`, {
        signal: globalThis.AbortSignal.timeout(2500),
      })
    );
    console.log(
      JSON.stringify({
        electron: process.versions.electron,
        bundledNode: process.versions.node,
        textLino: true,
        binaryLino: true,
        cli: true,
        listenerClosed: true,
        locksReleased: true,
        ownerShutdown: true,
      })
    );
  } catch (error) {
    console.error(phase, error);
    process.exitCode = 1;
  } finally {
    await control?.close();
    await desktopRunner.close();
    await rm(dir, { recursive: true, force: true });
    app.exit(process.exitCode ?? 0);
  }
};

void run().catch((error) => {
  console.error(error);
  app.exit(1);
});
