import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { jsonLog } from '../src/server/log.js';
import { followDiagnosticLogs } from '../src/web/diagnostic-log-feed.js';
import { createDiagnosticCommands } from '../src/cli/diagnostic-commands.js';
import { runCli } from '../src/cli/index.js';
import { dictionaries } from '../src/web/locales/index.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { diagnosticServer } from '../../experiments/issue-56/diagnostics-fixture.mjs';

const SESSION = '00000000-0000-4000-8000-000000000001';
const batch = (cursor, extra = {}) => ({
  ok: true,
  session: SESSION,
  cursor,
  items: [{ id: cursor, text: `line ${cursor}` }],
  ...extra,
});
const turn = () => new Promise((resolve) => globalThis.setImmediate(resolve));

test('structured logging hides nested camel-case secrets and bare credentials before serialization', () => {
  const lines = [];
  const secret = `fixture-${'sensitive'.repeat(6)}`;
  const nested = {
    apiKey: 'short-api-secret',
    vkToken: 'provider-fixture',
    codeVerifier: 'verifier-fixture',
    privateKey: 'private-fixture',
    refresh_token: 'refresh-fixture',
    sessionString: 'session-fixture',
    child: { cookie: 'cookie-fixture', ordinary: secret },
    safe: 'visible diagnostic',
  };
  jsonLog({ write: (line) => lines.push(line) })({ event: 'fixture', nested });
  assert.equal(lines.length, 1);
  for (const value of [
    'short-api-secret',
    'provider-fixture',
    'verifier-fixture',
    'private-fixture',
    'refresh-fixture',
    'session-fixture',
    'cookie-fixture',
    secret,
  ]) {
    assert.equal(lines[0].includes(value), false, `must redact ${value}`);
  }
  assert.equal(JSON.parse(lines[0]).nested.safe, 'visible diagnostic');
});

test('log formatting avoids getters, toJSON and cycles', () => {
  let invoked = false;
  const nested = {
    safe: 'visible diagnostic',
    date: new Date('2026-11-15T00:00:00Z'),
  };
  Object.defineProperty(nested, 'getSecret', {
    enumerable: true,
    get: () => {
      invoked = true;
      return 'accessor-fixture';
    },
  });
  nested.toJSON = () => {
    invoked = true;
    return { leaked: 'tojson-fixture' };
  };
  const error = new Error('fixture error');
  Object.defineProperty(error, 'message', {
    get: () => {
      invoked = true;
      return 'hidden';
    },
  });
  nested.error = error;
  nested.cycle = nested;
  const lines = [];
  jsonLog({ write: (line) => lines.push(line) })({ event: 'fixture', nested });
  assert.equal(invoked, false);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.nested.safe, 'visible diagnostic');
  assert.equal(parsed.nested.cycle, '[circular]');
  assert.equal(parsed.nested.error.message, '[accessor]');
  assert.equal(parsed.nested.date, '2026-11-15T00:00:00.000Z');
});

test('journal bounds entries, bytes and line size, reports gaps and resets stale cursors', async () => {
  const { createLogJournal } = await import('../src/server/log-journal.js');
  const journal = createLogJournal({ limit: 3, maxBytes: 800 });
  for (let i = 0; i < 6; i++) {
    journal.log({ event: 'tick', i });
  }
  const first = journal.read();
  assert.deepEqual(
    first.items.map((item) => item.id),
    [4, 5, 6]
  );
  assert.equal(first.dropped, true);
  assert.equal(
    journal.read({ after: 6, session: first.session }).items.length,
    0
  );
  assert.equal(journal.read({ after: 99, session: first.session }).reset, true);
  assert.equal(journal.read({ after: 6, session: SESSION }).items.length, 3);
  journal.log({ event: 'http', path: '/api/diagnostics/logs' });
  assert.equal(
    journal.read().cursor,
    6,
    'polling does not generate more polling logs'
  );
  const bounded = createLogJournal({ maxBytes: 16000 });
  for (let i = 0; i < 8; i++) {
    bounded.log({ message: '中 '.repeat(5000) });
  }
  const text = bounded.read().items.map((item) => item.text);
  assert.ok(text.every((item) => item.length <= 4096));
  assert.ok(Buffer.byteLength(text.join('')) <= 16000);
});

test(
  'log read API supports both LINO encodings and rejects foreign origins, mutations and invalid cursors',
  { timeout: 15000 },
  async () => {
    const fixture = await diagnosticServer();
    try {
      await fetch(`${fixture.base}/synthetic-activity`);
      let session;
      for (const accept of [LINO_TEXT, LINO_BINARY]) {
        const response = await fetch(`${fixture.base}/api/diagnostics/logs`, {
          headers: { accept },
        });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const value = await readWireResponse(response);
        assert.ok(
          value.items.some((item) => item.text.includes('/synthetic-activity'))
        );
        session = value.session;
        assert.equal(typeof session, 'string');
      }
      for (const query of [
        'after=-1',
        'after=NaN',
        'after=1.5',
        'session=bad',
      ]) {
        assert.equal(
          (await fetch(`${fixture.base}/api/diagnostics/logs?${query}`)).status,
          400
        );
      }
      assert.equal(
        (
          await fetch(`${fixture.base}/api/diagnostics/logs`, {
            method: 'POST',
          })
        ).status,
        405
      );
      assert.equal(
        (
          await fetch(`${fixture.base}/api/diagnostics/logs`, {
            headers: { origin: 'https://foreign.invalid' },
          })
        ).status,
        403
      );
      assert.equal(
        (
          await fetch(`${fixture.base}/api/diagnostics/logs`, {
            headers: { origin: fixture.base },
          })
        ).status,
        200
      );
      const reset = await readWireResponse(
        await fetch(
          `${fixture.base}/api/diagnostics/logs?after=999999&session=${session}`
        )
      );
      assert.equal(reset.reset, true);
      const lines = [];
      assert.equal(
        await runCli(['diagnostics', 'logs', `--url=${fixture.base}`], {
          log: (line) => lines.push(line),
        }),
        0
      );
      assert.ok(lines.some((line) => line.includes('synthetic-activity')));
    } finally {
      await fixture.close();
    }
  }
);

test(
  'diagnostics never bypasses the local passcode',
  { timeout: 15000 },
  async () => {
    const fixture = await diagnosticServer();
    const post = (path, body) =>
      fetch(`${fixture.base}/api/passcode/${path}`, {
        method: 'POST',
        headers: { 'content-type': LINO_TEXT },
        body: encodeWire(body, LINO_TEXT),
      });
    try {
      assert.equal((await post('set', { passcode: 'fixture' })).status, 200);
      assert.equal((await post('lock', {})).status, 200);
      for (const endpoint of ['logs', 'settings', 'session']) {
        assert.equal(
          (await fetch(`${fixture.base}/api/diagnostics/${endpoint}`)).status,
          423
        );
      }
    } finally {
      await fixture.close();
    }
  }
);

test('CLI owns follow cancellation and does not advance a rejected cursor or leak server errors', async () => {
  const signals = new EventEmitter();
  let reads = 0;
  const output = [];
  const cli = createDiagnosticCommands({
    signals,
    fetchImpl: async () => {
      reads++;
      if (reads === 1) {
        throw new Error('password=do-not-print');
      }
      return new globalThis.Response(encodeWire(batch(1), LINO_TEXT), {
        headers: { 'content-type': LINO_TEXT },
      });
    },
    wait: async () => {
      if (reads === 2) {
        signals.emit('SIGINT');
      }
    },
  });
  assert.equal(
    await cli.diagnostics({ _: ['logs'], follow: true }, (line) =>
      output.push(line)
    ),
    0
  );
  assert.equal(reads, 2);
  assert.deepEqual(output, [
    'Diagnostics unavailable; reconnecting.',
    'line 1',
  ]);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
  for (const args of [
    { url: 'https://user:secret@host' },
    { after: '-1' },
    { url: 'file:///tmp' },
  ]) {
    await assert.rejects(cli.diagnostics({ _: ['logs'], ...args }, () => {}));
  }
});

test('hidden log views cancel their owned read and never schedule a late update', async () => {
  let finish;
  let signal;
  let scheduled = 0;
  let updates = 0;
  const stop = followDiagnosticLogs({
    read: (_snapshot, owned) => {
      signal = owned;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    update: () => {
      updates++;
    },
    fail: () => assert.fail('cancel must not report failure'),
    clock: {
      setTimeout: () => {
        scheduled++;
      },
      clearTimeout: () => {},
    },
  });
  stop();
  assert.equal(signal.aborted, true);
  finish(batch(1));
  await turn();
  assert.equal(updates, 0);
  assert.equal(scheduled, 0);
});

test('live feed retains entries through failure, resets on restart and bounds merged snapshots', async () => {
  let next;
  const clock = {
    setTimeout: (work) => {
      next = work;
      return 1;
    },
    clearTimeout: () => {},
  };
  let round = 0;
  const snapshots = [];
  let failures = 0;
  const stop = followDiagnosticLogs({
    clock,
    read: async () => {
      round++;
      if (round === 2) {
        throw new Error('offline');
      }
      if (round === 3) {
        return batch(2, {
          items: [
            { id: 1, text: 'line 1' },
            { id: 2, text: 'line 2' },
          ],
          dropped: true,
        });
      }
      if (round === 4) {
        return batch(1, { session: SESSION.replace(/1$/, '2') });
      }
      if (round === 5) {
        return batch(1, { items: [{ id: -1, text: 'invalid' }] });
      }
      return batch(1);
    },
    update: (value) => snapshots.push(value),
    fail: () => {
      failures++;
    },
  });
  await turn();
  await next();
  assert.equal(snapshots.length, 1);
  assert.equal(failures, 1);
  await next();
  assert.equal(snapshots[1].items.length, 2);
  assert.equal(snapshots[1].gap, true);
  await next();
  assert.equal(snapshots[2].items.length, 1);
  assert.equal(snapshots[2].gap, false);
  await next();
  assert.equal(failures, 2);
  assert.equal(
    snapshots.length,
    3,
    'malformed responses never replace retained diagnostics'
  );
  stop();
});

test('all supported locales describe the same diagnostic states', () => {
  for (const dictionary of Object.values(dictionaries)) {
    for (const key of [
      'title',
      'hint',
      'show',
      'loading',
      'live',
      'unavailable',
      'gap',
      'copy',
      'copied',
      'copyFailed',
      'empty',
    ]) {
      assert.equal(typeof dictionary[`diagnostics.${key}`], 'string');
    }
  }
});

test('log feed caps merged entries and backs repeated failures off to thirty seconds', async () => {
  let next;
  let round = 0;
  const delays = [];
  const snapshots = [];
  const stop = followDiagnosticLogs({
    clock: {
      setTimeout: (work, ms) => {
        next = work;
        delays.push(ms);
        return 1;
      },
      clearTimeout: () => {},
    },
    read: async () => {
      round++;
      if (round > 2) {
        throw new Error('offline');
      }
      const end = round * 200;
      return batch(end, {
        items: Array.from({ length: 200 }, (_, index) => ({
          id: end - 199 + index,
          text: 'bounded entry',
        })),
      });
    },
    update: (value) => snapshots.push(value),
    fail: () => {},
  });
  await turn();
  await next();
  assert.equal(snapshots[1].items.length, 300);
  assert.equal(snapshots[1].items[0].id, 101);
  for (let i = 0; i < 7; i++) {
    await next();
  }
  assert.deepEqual(
    delays.slice(2),
    [2000, 4000, 8000, 16000, 30000, 30000, 30000]
  );
  stop();
});

test('stopping the foreground CLI drains a held read without publishing its late result', async () => {
  const signals = new EventEmitter();
  let finish;
  let signal;
  const cli = createDiagnosticCommands({
    signals,
    fetchImpl: (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const lines = [];
  const running = cli.diagnostics({ _: ['logs'], follow: true }, (line) =>
    lines.push(line)
  );
  await turn();
  signals.emit('SIGTERM');
  assert.equal(signal.aborted, true);
  finish(
    new globalThis.Response(encodeWire(batch(1), LINO_TEXT), {
      headers: { 'content-type': LINO_TEXT },
    })
  );
  assert.equal(await running, 0);
  assert.deepEqual(lines, []);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});
