import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  probeRunnerWorker,
  readRunnerHealth,
} from '../src/server/runner-health.js';
import { createServerControl } from '../src/server/rolling-control.js';
import { RollingSupervisor } from '../src/server/rolling-supervisor.js';
import { startRollingServer } from '../src/server/rolling-host.js';
import { createRunnerCommand } from '../src/cli/runner-command.js';
import { decodeWire, encodeWire, LINO_TEXT } from '../src/transport/lino.js';

const unknown = { ok: false, scope: 'application-worker', state: 'unknown' };
const privateControl = async (health, work) => {
  const dir = await mkdtemp(join(tmpdir(), 'runner-health-'));
  let control;
  try {
    control = await createServerControl({
      storeDir: dir,
      handle: { status: () => ({ pid: 123, port: 1 }), health },
    });
    await work(dir);
  } finally {
    await control?.close();
    await rm(dir, { recursive: true, force: true });
  }
};

test(
  'the real rolling worker reports ready and locked through its private host, then refuses after close',
  { timeout: 15000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runner-worker-health-'));
    let host;
    let control;
    try {
      host = await startRollingServer({
        port: 0,
        storeDir: dir,
        release: {
          entry: fileURLToPath(
            new URL('../bin/server-worker.js', import.meta.url)
          ),
          build: 'health-fixture',
        },
        options: {
          tls: false,
          telegramAccount: false,
          enableSync: false,
          enableHandlers: false,
          automations: { scheduler: false },
          emailPoll: false,
          backups: { intervalHours: 0 },
        },
      });
      control = await createServerControl({ storeDir: dir, handle: host });
      assert.equal((await readRunnerHealth(dir)).state, 'ready');
      for (const [action, body] of [
        ['set', { passcode: 'private-fixture' }],
        ['lock', {}],
      ]) {
        const response = await fetch(
          `http://127.0.0.1:${host.port}/api/passcode/${action}`,
          {
            method: 'POST',
            headers: { 'content-type': LINO_TEXT },
            body: encodeWire(body, LINO_TEXT),
          }
        );
        assert.equal(response.status, 200);
        await response.arrayBuffer();
      }
      assert.equal((await readRunnerHealth(dir)).state, 'locked');
      await host.close();
      assert.ok(host.status().pid, 'metadata can retain an exited worker PID');
      assert.deepEqual(await readRunnerHealth(dir), unknown);
      host = null;
    } finally {
      await control?.close();
      await host?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'health reads the private host instead of cached status, and closes its CLI owner',
  { timeout: 5000 },
  async () => {
    let state = 'ready';
    await privateControl(
      () => ({ state }),
      async (dir) => {
        const file = join(dir, 'runtime/server.json');
        const metadata = await readFile(file, 'utf8');
        const command = createRunnerCommand({
          directory: () => {
            throw new Error('must not load runner profiles');
          },
        });
        const listeners = process.listenerCount('SIGINT');
        for (state of ['ready', 'locked', 'degraded', 'unknown', 'PRIVATE']) {
          const output = [];
          const code = await command({ _: ['health'], store: dir }, (line) =>
            output.push(line)
          );
          const confirmed = ['ready', 'locked', 'degraded'].includes(state);
          assert.equal(code, confirmed ? 0 : 1);
          assert.deepEqual(decodeWire(output[0], LINO_TEXT), {
            ...unknown,
            ok: confirmed,
            state: confirmed ? state : 'unknown',
          });
        }
        assert.equal(process.listenerCount('SIGINT'), listeners);
        assert.equal(await readFile(file, 'utf8'), metadata);
        await assert.rejects(stat(join(dir, 'data.lino')), { code: 'ENOENT' });
        assert.equal(
          await command(
            { _: ['health'], store: dir, url: 'http://private.invalid' },
            () => {}
          ),
          1
        );
      }
    );
  }
);

test(
  'missing or old control hosts and cancelled replies stay unconfirmed',
  { timeout: 5000 },
  async () => {
    await privateControl(undefined, async (dir) => {
      assert.deepEqual(await readRunnerHealth(dir), unknown);
      assert.deepEqual(await readRunnerHealth(join(dir, 'missing')), unknown);
    });
    const { promise: entered, resolve: enter } = Promise.withResolvers();
    const { promise: gate, resolve: release } = Promise.withResolvers();
    await privateControl(
      async () => {
        enter();
        await gate;
        return { state: 'ready' };
      },
      async (dir) => {
        const abort = new AbortController();
        const pending = readRunnerHealth(dir, { signal: abort.signal });
        try {
          await entered;
          abort.abort();
          assert.deepEqual(await pending, unknown);
          assert.deepEqual(
            await readRunnerHealth(dir, { signal: abort.signal }),
            unknown
          );
        } finally {
          release();
          await pending;
        }
      }
    );
  }
);

test(
  'private worker health bounds responses and authenticates the owned front',
  { timeout: 7000 },
  async () => {
    let reply = { status: 200, body: { ok: true, store: { degraded: false } } };
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push({ url: req.url, headers: req.headers });
      if (reply.stall) {
        return;
      }
      res.writeHead(reply.status, { 'content-type': reply.type ?? LINO_TEXT });
      res.end(reply.raw ?? encodeWire(reply.body, LINO_TEXT));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const worker = {
      port: server.address().port,
      token: 'private-front-token',
    };
    try {
      for (const [next, expected] of [
        [reply, 'ready'],
        [
          { status: 200, body: { ok: true, store: { degraded: true } } },
          'degraded',
        ],
        [
          { status: 423, body: { service: 'meta-sovereign', code: 'locked' } },
          'locked',
        ],
        [{ status: 200, body: { ok: true } }, 'unknown'],
        [{ status: 423, body: { code: 'locked' } }, 'unknown'],
        [
          { status: 503, body: { ok: true, store: { degraded: false } } },
          'unknown',
        ],
        [
          { status: 200, type: 'text/html', raw: '<html>PRIVATE</html>' },
          'unknown',
        ],
        [{ status: 200, raw: 'x'.repeat(17000) }, 'unknown'],
        [{ stall: true }, 'unknown'],
      ]) {
        reply = next;
        assert.equal(
          await probeRunnerWorker(worker, { port: 8123, tls: true }),
          expected
        );
      }
      assert.ok(
        requests.every(
          ({ url, headers }) =>
            url === '/api/health' &&
            headers['x-meta-sovereign-front'] === worker.token &&
            headers['x-meta-sovereign-secure'] === '1' &&
            headers.host === '127.0.0.1:8123'
        )
      );
      const { promise: waiting, resolve: finish } = Promise.withResolvers();
      await privateControl(
        async () => {
          await waiting;
          return { state: 'ready' };
        },
        async (dir) => {
          try {
            assert.deepEqual(await readRunnerHealth(dir), unknown);
          } finally {
            finish();
          }
        }
      );
      assert.equal(await probeRunnerWorker({ port: -1 }), 'unknown');
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);

test(
  'a handoff or worker exit during a health read cannot confirm the old worker',
  { timeout: 5000 },
  async () => {
    const { promise: entered, resolve: enter } = Promise.withResolvers();
    const { promise: gate, resolve: release } = Promise.withResolvers();
    const server = http.createServer(async (_req, res) => {
      enter();
      await gate;
      res.writeHead(200, { 'content-type': LINO_TEXT });
      res.end(encodeWire({ ok: true, store: { degraded: false } }, LINO_TEXT));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const supervisor = new RollingSupervisor({ port: 8123 });
    supervisor.current = {
      port: server.address().port,
      token: 'private',
      client: { exited: false },
    };
    const pending = supervisor.health();
    try {
      await entered;
      supervisor.current = { ...supervisor.current };
      release();
      assert.deepEqual(await pending, { state: 'unknown' });
      for (const change of [
        { busy: true },
        { closed: true },
        { recovering: Promise.resolve() },
      ]) {
        Object.assign(supervisor, change);
        assert.deepEqual(await supervisor.health(), { state: 'unknown' });
        Object.assign(supervisor, {
          busy: false,
          closed: false,
          recovering: null,
        });
      }
      supervisor.current.client.exited = true;
      assert.deepEqual(await supervisor.health(), { state: 'unknown' });
    } finally {
      release();
      await pending;
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
