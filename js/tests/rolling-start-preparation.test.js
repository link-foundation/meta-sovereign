import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { startRollingServer } from '../src/server/rolling-host.js';
import { rollingWorkerOptions as options } from './helpers/rolling-options.mjs';
import { temporaryDirectory } from './helpers/temporary-directory.mjs';

const listen = (server, port = 0) =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
const close = (server) => new Promise((resolve) => server.close(resolve));
const directory = (t) => temporaryDirectory(t, 'ms-prepare-admission-');

test(
  'a busy rolling listener rejects before preparing a release',
  { timeout: 6000 },
  async (t) => {
    const blocker = net.createServer();
    const port = await listen(blocker);
    t.after(() => close(blocker));
    let prepared = 0;
    await assert.rejects(
      startRollingServer({
        port,
        storeDir: await directory(t),
        options: { tls: false },
        prepareRelease: async () => {
          prepared++;
          throw new Error('must not prepare');
        },
      }),
      (error) =>
        error.code === 'EADDRINUSE' && /already in use/u.test(error.message)
    );
    assert.equal(prepared, 0);
  }
);

test(
  'release preparation owns the listener and a failure releases it without spawning a worker',
  { timeout: 6000 },
  async (t) => {
    const refused = new Error('fixture snapshot refused');
    let publicPort;
    let prepared = 0;
    await assert.rejects(
      startRollingServer({
        port: 0,
        storeDir: await directory(t),
        options: { tls: false },
        prepareRelease: async ({ port }) => {
          publicPort = port;
          prepared++;
          const competitor = net.createServer();
          await assert.rejects(listen(competitor, port), {
            code: 'EADDRINUSE',
          });
          await close(competitor);
          throw refused;
        },
      }),
      (error) => error === refused
    );
    assert.equal(prepared, 1);
    const replacement = net.createServer();
    assert.equal(await listen(replacement, publicPort), publicPort);
    await close(replacement);
  }
);

test(
  'a prepared release starts one healthy worker on the already owned listener',
  { timeout: 30000 },
  async (t) => {
    let prepared = 0;
    let boundPort;
    let host;
    try {
      host = await startRollingServer({
        port: 0,
        storeDir: await directory(t),
        options,
        prepareRelease: async ({ port }) => {
          prepared++;
          boundPort = port;
          return {
            build: 'fixture-prepared',
            entry: fileURLToPath(
              new URL('../bin/server-worker.js', import.meta.url)
            ),
          };
        },
      });
      assert.equal(prepared, 1);
      assert.equal(host.port, boundPort);
      assert.equal(host.status().build, 'fixture-prepared');
      const response = await globalThis.fetch(
        `http://127.0.0.1:${host.port}/api/health`
      );
      await response.arrayBuffer();
      assert.equal(response.status, 200);
    } finally {
      await host?.close();
    }
  }
);
