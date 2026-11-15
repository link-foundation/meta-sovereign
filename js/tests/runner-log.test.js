import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { withLoggedSession } from '../src/server/log-session.js';
import { createLogSettings, verboseFlag } from '../src/server/log-settings.js';
import { createLogJournal } from '../src/server/log-journal.js';
import { startServer } from '../src/server/index.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  createVkOnlineJob,
  saveVkOnline,
} from '../src/automation/vk-online.js';
import { createAutomationScheduler } from '../src/automation/scheduler.js';
import { normalizeAutomation } from '../src/automation/automations.js';
import { traceTrigger } from '../src/automation/trigger-log.js';
import { createDiagnosticCommands } from '../src/cli/diagnostic-commands.js';
import { isDiagnosticSettings } from '../src/transport/diagnostic-settings.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import { runnerLogServer } from '../../experiments/issue-56/runner-log-fixture.mjs';

const directory = async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ms-session-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};
const entries = async (dir) => {
  const names = (await readdir(join(dir, 'logs'))).filter((name) =>
    name.endsWith('.log')
  );
  return Promise.all(
    names.map(async (name) => ({
      name,
      text: await readFile(join(dir, 'logs', name), 'utf8'),
    }))
  );
};
const wire = async (base, path, input, type = LINO_TEXT, extra = {}) => {
  const response = await fetch(base + path, {
    ...extra,
    headers: {
      accept: type,
      ...(input ? { 'content-type': type } : {}),
      ...extra.headers,
    },
    ...(input ? { method: 'POST', body: encodeWire(input, type) } : {}),
  });
  return {
    response,
    data: response.status === 204 ? null : await readWireResponse(response),
  };
};

test(
  'sessions retain distinct private redacted files and drain one owned close',
  { timeout: 10000 },
  async (t) => {
    const dir = await directory(t);
    let closes = 0;
    let release;
    let port = 1;
    let getterReads = 0;
    const drain = new Promise((resolve) => {
      release = resolve;
    });
    const handle = await withLoggedSession(
      {
        storeDir: dir,
        log: () => {
          throw Error('aggregate unavailable');
        },
      },
      async ({ log }) => {
        const hostile = Object.fromEntries(
          ['level', 'event', 'path'].map((key) => [
            key,
            {
              enumerable: true,
              get() {
                getterReads++;
                throw new Error('log metadata getter was invoked');
              },
            },
          ])
        );
        createLogJournal({ sink: log }).log(
          Object.defineProperties({}, hostile)
        );
        assert.equal(getterReads, 0);
        log({
          event: 'fixture',
          token: 'short-fixture-secret',
          nested: { password: 'short-password' },
        });
        return {
          get port() {
            return port;
          },
          close: () => {
            closes++;
            return drain;
          },
        };
      }
    );
    port = 2;
    assert.equal(
      handle.port,
      2,
      'a rolling replacement retains its live port accessor'
    );
    const closing = handle.close();
    assert.equal(handle.close(), closing);
    await Promise.resolve();
    assert.equal(closes, 1);
    assert.equal(
      (await entries(dir))[0].text.includes('runner_session_closed'),
      false
    );
    release();
    await closing;
    const second = await withLoggedSession({ storeDir: dir }, async () => ({
      close: async () => {},
    }));
    await second.close();
    const logs = await entries(dir);
    assert.equal(logs.length, 2);
    for (const { name, text } of logs) {
      assert.match(text, /runner_session_started/);
      assert.match(text, /runner_session_closed/);
      assert.doesNotMatch(text, /short-fixture-secret|short-password/);
      if (process.platform !== 'win32') {
        assert.equal((await stat(join(dir, 'logs', name))).mode & 0o777, 0o600);
      }
    }
    const aggregate = [];
    const quiet = await withLoggedSession(
      { storeDir: dir, verbose: false, log: (entry) => aggregate.push(entry) },
      async ({ log, diagnosticsSession }) => {
        log({ level: 'debug', event: 'quiet_hidden' });
        log({ level: 'error', event: 'quiet_failure' });
        diagnosticsSession.setVerbose(true);
        log({ level: 'debug', event: 'verbose_restored' });
        return { close: async () => {} };
      }
    );
    await quiet.close();
    const allText = (await entries(dir)).map(({ text }) => text).join('\n');
    assert.doesNotMatch(allText, /quiet_hidden/);
    assert.match(allText, /quiet_failure/);
    assert.match(allText, /verbose_restored/);
    assert.equal(
      aggregate.some(({ event }) => event === 'quiet_hidden'),
      false
    );
    assert.equal(
      aggregate.some(({ event }) => event === 'verbose_restored'),
      true
    );
    if (process.platform !== 'win32') {
      assert.equal((await stat(join(dir, 'logs'))).mode & 0o777, 0o700);
    }
  }
);

test(
  'actual runtime startup refusal retains its independent session evidence',
  { timeout: 15000 },
  async (t) => {
    const dir = await directory(t);
    await assert.rejects(
      startServer({
        storeDir: dir,
        port: -1,
        enableSync: false,
        enableHandlers: false,
        telegramAccount: false,
        automations: { scheduler: false },
      })
    );
    const logs = await entries(dir);
    assert.equal(logs.length, 1);
    assert.match(logs[0].text, /runner_session_start_failed/);
    assert.doesNotMatch(logs[0].text, /runner_session_ready/);
  }
);

test(
  'failed shutdown retains a redacted error and never records a successful close',
  { timeout: 10000 },
  async (t) => {
    const dir = await directory(t);
    const handle = await withLoggedSession({ storeDir: dir }, async () => ({
      close: async () => {
        throw Error('access_token=short-failure-secret');
      },
    }));
    await assert.rejects(handle.close(), /short-failure-secret/);
    const [{ text }] = await entries(dir);
    assert.match(text, /runner_session_close_failed/);
    assert.doesNotMatch(text, /short-failure-secret|runner_session_closed/);
  }
);

test(
  'verbose preferences survive a real Lino restart and failed acknowledgement preserves the prior preference',
  { timeout: 10000 },
  async (t) => {
    const file = join(await directory(t), 'preferences.lino');
    let store = await createLinoTextStore(file);
    const journal = createLogJournal();
    let settings = await createLogSettings({ store, journal });
    assert.equal(settings.read().verbose, true);
    await settings.save({ verbose: false });
    await store.close();
    store = await createLinoTextStore(file);
    t.after(() => store.close());
    settings = await createLogSettings({ store, journal });
    assert.equal(settings.read().verbose, false);
    const flush = store.flush;
    store.flush = async () => {
      throw Error('synthetic acknowledgement refusal');
    };
    await assert.rejects(
      settings.save({ verbose: true }),
      /acknowledgement refusal/
    );
    store.flush = flush;
    assert.equal(settings.read().verbose, false);
    assert.equal((await store.get('diagnostics:settings')).verbose, false);
    const override = await createLogSettings({ store, journal, verbose: true });
    assert.equal(override.read().verbose, true);
    assert.equal(
      (await store.get('diagnostics:settings')).verbose,
      false,
      'launch override does not replace owner preference'
    );
    assert.equal(verboseFlag('0'), false);
    assert.equal(verboseFlag('false'), false);
    assert.equal(verboseFlag(undefined), undefined);
    assert.throws(() => verboseFlag('maybe'));
  }
);

test(
  'both Lino interfaces acknowledge verbosity and expose a full finite redacted session download',
  { timeout: 15000 },
  async () => {
    const fixture = await runnerLogServer();
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const initial = await wire(
          fixture.base,
          '/api/diagnostics/settings',
          null,
          type
        );
        assert.equal(initial.response.status, 200);
        assert.ok(isDiagnosticSettings(initial.data));
        assert.equal(initial.data.session.persisted, true);
        const saved = await wire(
          fixture.base,
          '/api/diagnostics/settings',
          { verbose: false },
          type
        );
        assert.equal(saved.data.verbose, false);
        await wire(
          fixture.base,
          '/api/client-log',
          { event: 'hidden_debug_fixture', level: 'debug' },
          type
        );
        await wire(
          fixture.base,
          '/api/client-log',
          {
            event: 'retained_error_fixture',
            level: 'error',
            error: 'access_token=short-api-secret',
          },
          type
        );
        const log = await fetch(`${fixture.base}/api/diagnostics/session`, {
          headers: { accept: type },
        });
        assert.equal(log.status, 200);
        assert.equal(log.headers.get('cache-control'), 'no-store');
        const text = await log.text();
        assert.equal(
          Buffer.byteLength(text),
          Number(log.headers.get('content-length'))
        );
        assert.match(text, /runner_session_started/);
        assert.match(text, /retained_error_fixture/);
        assert.doesNotMatch(text, /hidden_debug_fixture|short-api-secret/);
        assert.match(
          log.headers.get('content-disposition'),
          /attachment; filename="[a-zA-Z0-9.-]+\.log"/
        );
        await wire(
          fixture.base,
          '/api/diagnostics/settings',
          { verbose: true },
          type
        );
      }
      assert.equal(
        (
          await wire(fixture.base, '/api/diagnostics/settings', {
            verbose: 'false',
          })
        ).response.status,
        400
      );
      assert.equal(
        (
          await fetch(`${fixture.base}/api/diagnostics/settings`, {
            method: 'DELETE',
          })
        ).status,
        405
      );
      assert.equal(
        (
          await fetch(`${fixture.base}/api/diagnostics/session`, {
            method: 'POST',
          })
        ).status,
        405
      );
      for (const path of [
        '/api/diagnostics/settings',
        '/api/diagnostics/session',
      ]) {
        assert.equal(
          (
            await fetch(fixture.base + path, {
              headers: { Origin: 'https://foreign.invalid' },
            })
          ).status,
          403
        );
      }
      const lines = [];
      const commands = createDiagnosticCommands();
      assert.equal(
        await commands.diagnostics(
          { _: ['settings'], url: fixture.base, verbose: 'false' },
          (line) => lines.push(line)
        ),
        0
      );
      assert.match(lines[0], /verbose.*false/);
      assert.equal(
        (await wire(fixture.base, '/api/diagnostics/settings')).data.verbose,
        false
      );
    } finally {
      await fixture.close();
    }
  }
);

test(
  'memory embedders do not create a session file or claim persistence',
  { timeout: 10000 },
  async (t) => {
    const dir = await directory(t);
    const handle = await startServer({
      store: createMemoryStore(),
      storeDir: dir,
      enableSync: false,
      enableHandlers: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    try {
      const { data } = await wire(
        `http://127.0.0.1:${handle.port}`,
        '/api/diagnostics/settings'
      );
      assert.equal(data.session.persisted, false);
      assert.equal(
        (await fetch(`http://127.0.0.1:${handle.port}/api/diagnostics/session`))
          .status,
        404
      );
      await assert.rejects(readdir(join(dir, 'logs')), { code: 'ENOENT' });
    } finally {
      await handle.close();
    }
  }
);

test(
  'actual provider timer traces checks, completion and failure without changing effects',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    await saveVkOnline(store, { enabled: true, everyMinutes: 1 });
    let tick;
    let effects = 0;
    let now = Date.now();
    const lines = [];
    const job = createVkOnlineJob({
      store,
      now: () => now,
      setInterval: (callback) => {
        tick = callback;
        return 1;
      },
      clearInterval: () => {},
      optionsFor: async () => ({ token: 'fixture' }),
      resolve: () => ({
        live: {
          setOnline: async () => {
            effects++;
            return { confirmed: true };
          },
        },
      }),
      log: (entry) => lines.push(entry),
    });
    try {
      job.start();
      await tick();
      assert.equal(effects, 1);
      assert.equal(lines[0].event, 'trigger_check');
      assert.equal(lines.at(-1).event, 'trigger_finished');
      assert.ok(lines.at(-1).durationMs >= 0);
      const put = store.put;
      now += 120000;
      store.put = async () => {
        throw Error('synthetic storage refusal');
      };
      await tick();
      store.put = put;
      assert.equal(effects, 1);
      assert.ok(
        lines.some((entry) => entry.event === 'trigger_failed' && entry.error)
      );
    } finally {
      await job.stop();
    }
  }
);

test(
  'scheduled and incoming draft admission retain timing and failure evidence',
  { timeout: 10000 },
  async () => {
    const store = createMemoryStore();
    const automation = normalizeAutomation({
      id: 'timed',
      triggers: [
        { kind: 'schedule', every: '1d' },
        { kind: 'incoming', pattern: 'hello' },
      ],
    });
    await store.put(automation);
    const lines = [];
    const calls = [];
    const scheduler = createAutomationScheduler({
      store,
      runner: {
        run: async (_automation, options) => {
          calls.push(options);
          return { queued: ['draft'] };
        },
      },
      log: (entry) => lines.push(entry),
    });
    try {
      await scheduler.tick();
      await scheduler.onMessage({
        id: 'msg:vk:2',
        source: 'vk',
        chat: '7',
        sender: '7',
        body: 'hello',
        timestamp: new Date().toISOString(),
      });
      assert.deepEqual(
        calls.map((value) => value.trigger),
        ['schedule', 'incoming']
      );
      assert.ok(calls.every((value) => value.confirmed === undefined));
      assert.equal(
        lines.filter((entry) => entry.event === 'trigger_check').length,
        2
      );
      assert.equal(
        lines.filter((entry) => entry.event === 'trigger_finished').length,
        2
      );
      await assert.rejects(
        traceTrigger(
          (entry) => lines.push(entry),
          'synthetic-failure',
          async () => {
            throw Error('fixture failure');
          }
        )
      );
      assert.equal(lines.at(-1).event, 'trigger_failed');
      assert.ok(Number.isFinite(lines.at(-1).durationMs));
      assert.equal(
        await traceTrigger(
          () => {
            throw Error('sink refusal');
          },
          'sink-test',
          async () => 7
        ),
        7
      );
    } finally {
      await scheduler.stop();
    }
  }
);
