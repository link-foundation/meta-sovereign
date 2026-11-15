import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  createVkOnlineJob,
  loadVkOnline,
  saveVkOnline,
} from '../src/automation/vk-online.js';
import { createVkOnlineCommands } from '../src/cli/vk-online-commands.js';
import { runCli } from '../src/cli/index.js';
import { createVkOnlineApi } from '../src/web/vk-online-api.js';
import { dictionaries } from '../src/web/locales/index.js';
import { ACCOUNT_KEY } from '../src/web/telegram-account-scope.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
  LINO_BINARY,
} from '../src/transport/lino.js';
import {
  onlineAdapter,
  onlineServer,
} from '../../experiments/issue-56/vk-online-fixture.mjs';

const jobFor = (store, adapter, extra = {}) =>
  createVkOnlineJob({
    store,
    resolve: () => ({ live: adapter.live }),
    optionsFor: async () => ({ token: 'fixture-user-token' }),
    ...extra,
  });

test(
  'VK actual adapter confirms only the positive account.setOnline acknowledgement',
  { timeout: 10000 },
  async () => {
    const adapter = onlineAdapter();
    assert.equal(
      typeof adapter.live.setOnline,
      'function',
      'the actual VK adapter must expose online refresh'
    );
    assert.deepEqual(
      await adapter.live.setOnline({ token: 'fixture-user-token' }),
      { confirmed: true }
    );
    assert.equal(adapter.fake.calls[0].name, 'account.setOnline');
    assert.equal(
      adapter.fake.calls[0].params.access_token,
      'fixture-user-token'
    );
    adapter.mode('unconfirmed');
    await assert.rejects(
      adapter.live.setOnline({ token: 'fixture-user-token' }),
      { code: 'unconfirmed' }
    );
    adapter.mode('refused');
    await assert.rejects(
      adapter.live.setOnline({ token: 'fixture-user-token' }),
      (error) => error.vkCode === 5
    );
  }
);

test('scheduling starts disabled, obeys the saved interval, throttles failures and retains manual action', async () => {
  const store = createMemoryStore();
  const adapter = onlineAdapter();
  let time = 1700000000000;
  const job = jobFor(store, adapter, { now: () => time });
  assert.deepEqual((await loadVkOnline(store)).settings, {
    enabled: false,
    everyMinutes: 14,
  });
  await job.run({ scheduled: true });
  assert.equal(adapter.fake.calls.length, 0);
  await saveVkOnline(store, { enabled: true, everyMinutes: 14 });
  assert.equal((await job.run({ scheduled: true })).last.status, 'confirmed');
  time += 13 * 60000;
  assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
  time += 60000;
  adapter.mode('refused');
  assert.equal((await job.run({ scheduled: true })).last.status, 'refused');
  assert.equal((await job.run({ scheduled: true })).skipped, 'not-due');
  await saveVkOnline(store, { enabled: false, everyMinutes: 3 });
  adapter.mode('confirmed');
  assert.equal((await job.run()).last.status, 'confirmed');
  assert.equal(adapter.fake.calls.length, 3);
  await job.stop();
});

test('the service reads the actual saved user token through the common connection options', async () => {
  const store = createMemoryStore();
  const adapter = onlineAdapter();
  await store.put({
    id: 'secret:vk:access-token',
    value: 'saved-fixture-user-token',
  });
  const job = createVkOnlineJob({
    store,
    resolve: () => ({ live: adapter.live }),
  });
  try {
    assert.equal((await job.run()).last.status, 'confirmed');
    assert.equal(
      adapter.fake.calls[0].params.access_token,
      'saved-fixture-user-token'
    );
  } finally {
    await job.stop();
  }
});

test(
  'acknowledged settings and attempt time survive a real Lino restart without a duplicate due effect',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-online-'));
    let store;
    let job;
    const adapter = onlineAdapter();
    try {
      const path = join(dir, 'links.lino');
      store = await createLinoTextStore(path);
      await saveVkOnline(store, { enabled: true, everyMinutes: 2 });
      job = jobFor(store, adapter, { now: () => 1700000000000 });
      await job.run({ scheduled: true });
      await job.stop();
      await store.close();
      store = await createLinoTextStore(path);
      job = jobFor(store, adapter, { now: () => 1700000060000 });
      const result = await job.run({ scheduled: true });
      assert.deepEqual(result.settings, { enabled: true, everyMinutes: 2 });
      assert.equal(result.last.status, 'confirmed');
      assert.equal(result.skipped, 'not-due');
      assert.equal(adapter.fake.calls.length, 1);
    } finally {
      await job?.stop();
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('overlapping refreshes coalesce, stop drains the owned effect and prevents later calls', async () => {
  const store = createMemoryStore();
  let finish;
  let admit;
  let calls = 0;
  let closed = false;
  const started = new Promise((resolve) => {
    admit = resolve;
  });
  const job = jobFor(store, {
    live: {
      setOnline: () => {
        calls++;
        admit();
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
  });
  const first = job.run();
  await started;
  const second = job.run({ scheduled: true });
  assert.equal(first, second);
  const stopping = job.stop().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  finish({ confirmed: true });
  await stopping;
  assert.equal((await first).last.status, 'confirmed');
  assert.equal((await job.run()).skipped, 'stopped');
  assert.equal(calls, 1);
});

test(
  'intent failure prevents effects; outcome failure retains unknown durable intent across restart',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-online-intent-'));
    let base;
    let reopened;
    const adapter = onlineAdapter();
    let failAt = 1;
    let writes = 0;
    try {
      const path = join(dir, 'links.lino');
      base = await createLinoTextStore(path);
      const store = {
        ...base,
        flush: async () => {
          if (++writes === failAt) {
            throw new Error('Fixture flush refused');
          }
          await base.flush();
        },
      };
      let job = jobFor(store, adapter);
      await assert.rejects(job.run(), /Fixture flush refused/u);
      assert.equal(adapter.fake.calls.length, 0);
      assert.equal((await loadVkOnline(store)).last, null);
      failAt = writes + 2;
      await assert.rejects(job.run(), /Fixture flush refused/u);
      assert.equal(adapter.fake.calls.length, 1);
      assert.equal((await loadVkOnline(store)).last.status, 'unknown');
      await job.stop();
      // Read the acknowledged disk intent without closing/flushing the live writer.
      reopened = await createLinoTextStore(path);
      assert.equal((await loadVkOnline(reopened)).last.status, 'unknown');
      job = jobFor(reopened, adapter);
      await job.stop();
    } finally {
      await reopened?.close();
      await base?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('provider refusal, missing credentials and lost responses preserve distinct redacted outcomes', async () => {
  for (const mode of ['refused', 'unknown', 'unconfirmed', 'missing']) {
    const store = createMemoryStore();
    const adapter = onlineAdapter();
    adapter.mode(mode);
    const logs = [];
    const job = jobFor(store, adapter, {
      log: (event) => logs.push(event),
      ...(mode === 'missing' ? { optionsFor: async () => ({}) } : {}),
    });
    const result = await job.run();
    assert.equal(
      result.last.status,
      ['refused', 'missing'].includes(mode) ? 'refused' : 'unknown'
    );
    assert.equal(result.last.confirmedAt, undefined);
    assert.ok(!JSON.stringify({ result, logs }).includes('fixture-user-token'));
    assert.equal(adapter.fake.calls.length, mode === 'missing' ? 0 : 1);
    await job.stop();
  }
  const store = createMemoryStore();
  const job = jobFor(store, {
    live: {
      setOnline: async () => {
        throw new Error('Lost fixture-user-token\nprivate stack');
      },
    },
  });
  assert.equal((await job.run()).last.error, 'Lost <redacted>');
  await job.stop();
});

test('invalid or refused settings retain the last acknowledged configuration', async () => {
  const store = createMemoryStore();
  const wanted = { enabled: true, everyMinutes: 4 };
  await saveVkOnline(store, wanted);
  for (const input of [
    { enabled: 'false', everyMinutes: 4 },
    ...[0, 15, 1.5, NaN].map((everyMinutes) => ({
      enabled: true,
      everyMinutes,
    })),
  ]) {
    await assert.rejects(saveVkOnline(store, input));
  }
  const broken = {
    ...store,
    flush: async () => {
      throw new Error('Fixture setting refused');
    },
  };
  await assert.rejects(
    saveVkOnline(broken, { enabled: false, everyMinutes: 5 })
  );
  assert.deepEqual((await loadVkOnline(store)).settings, wanted);
});

test('CLI separates read-only status, persisted configuration and explicit foreground effects', async () => {
  const store = createMemoryStore();
  const adapter = onlineAdapter();
  const opened = [];
  const output = [];
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  const command = createVkOnlineCommands({
    openStore: async () => {
      opened.push('write');
      return store;
    },
    openReadOnly: async () => {
      opened.push('read');
      return store;
    },
    createJob: ({ store: target }) => jobFor(target, adapter),
  })['vk-online'];
  const log = (value) => output.push(JSON.parse(value));
  assert.equal(await command({}, log), 0);
  assert.equal(
    await command({ enabled: 'true', 'every-minutes': '2' }, log),
    0
  );
  assert.equal(adapter.fake.calls.length, 0);
  assert.equal(await command({ run: 'true' }, log), 0);
  adapter.mode('refused');
  assert.equal(await command({ run: 'true' }, log), 1);
  assert.deepEqual(opened, ['read', 'write', 'write', 'write']);
  assert.equal(closed, 4);
  assert.equal(output.at(-1).last.status, 'refused');
  await assert.rejects(command({ run: 'maybe' }, log), /true or false/u);
  await assert.rejects(command({ 'every-minutes': '15' }, log));
  assert.equal(closed, 5);
  await assert.rejects(
    runCli(['vk-online', '--enabled=maybe'], { log }),
    /true or false/u
  );
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `online configuration and explicit run use default ${type} routes with origin refusal`,
    { timeout: 15000 },
    async () => {
      const fixture = await onlineServer();
      const request = async (path = '', body, origin) => {
        const response = await fetch(`${fixture.base}/api/vk/online${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            accept: type,
            'content-type': type,
            ...(origin ? { origin } : {}),
          },
          ...(body === undefined ? {} : { body: encodeWire(body, type) }),
        });
        assert.ok(response.headers.get('content-type').startsWith(type));
        return {
          status: response.status,
          body: await readWireResponse(response),
        };
      };
      try {
        assert.equal((await request()).body.settings.enabled, false);
        assert.equal(
          (await request('/run', {}, 'https://foreign.invalid')).status,
          403
        );
        assert.equal(fixture.fake.calls.length, 0);
        assert.equal(
          (await request('', { enabled: true, everyMinutes: 14 })).body.settings
            .enabled,
          true
        );
        assert.equal(
          (await request('', { enabled: true, everyMinutes: 15 })).status,
          400
        );
        const result = (await request('/run', {})).body;
        assert.equal(result.last.status, 'confirmed');
        assert.equal(result.schedulerRunning, false);
        fixture.mode('refused');
        assert.equal((await request('/run', {})).body.last.status, 'refused');
        fixture.refuseWrites(true);
        assert.equal(
          (await request('', { enabled: false, everyMinutes: 2 })).status,
          400
        );
        assert.equal((await request()).body.settings.enabled, true);
        assert.equal(fixture.messages(), 0);
        assert.equal(fixture.fake.calls.length, 2);
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'owned server timer starts after port ownership, stays idle without opt-in and is cleared on close',
  { timeout: 10000 },
  async () => {
    let tick;
    let timers = 0;
    let cleared = 0;
    const clock = {
      setInterval: (callback, period) => {
        assert.equal(period, 60000);
        tick = callback;
        timers++;
        return { unref() {} };
      },
      clearInterval: () => {
        cleared++;
      },
    };
    const fixture = await onlineServer({ scheduler: true, clock });
    try {
      await new Promise((resolve) => globalThis.setImmediate(resolve));
      assert.equal(timers, 1);
      await tick();
      assert.equal(fixture.fake.calls.length, 0);
      await saveVkOnline(fixture.store, { enabled: true, everyMinutes: 14 });
      await tick();
      assert.equal(fixture.fake.calls.length, 1);
      await assert.rejects(
        onlineServer({ scheduler: true, clock, port: fixture.port })
      );
      assert.equal(timers, 1);
    } finally {
      await fixture.close();
    }
    assert.ok(cleared >= 1);
  }
);

test('offline controls save configuration without claiming a running schedule or provider effect in all locales', async () => {
  const store = createMemoryStore();
  const api = createVkOnlineApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  assert.equal((await api.vkOnline()).settings.enabled, false);
  const saved = await api.saveVkOnline({ enabled: true, everyMinutes: 14 });
  assert.equal(saved.schedulerRunning, false);
  assert.equal(saved.canRun, false);
  assert.equal((await api.runVkOnline()).ok, false);
  assert.equal((await loadVkOnline(store)).last, null);
  const denied = createVkOnlineApi({
    get: async () => null,
    report: async () => ({ ok: false, error: 'lost acknowledgement' }),
    local: async () => store,
  });
  assert.equal(
    (await denied.saveVkOnline({ enabled: false, everyMinutes: 3 })).ok,
    false
  );
  assert.equal((await loadVkOnline(store)).settings.enabled, true);
  const keys = Object.keys(dictionaries.en).filter((key) =>
    key.startsWith('vkOnline.')
  );
  assert.equal(keys.length, 14);
  for (const language of ['en', 'ru', 'hi', 'zh']) {
    for (const key of keys) {
      assert.ok(dictionaries[language][key], `${language}.${key}`);
    }
  }
});

test('offline settings refuse an extra account and a switch while the local store opens', async () => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage'
  );
  const store = createMemoryStore();
  let slot = '2';
  let opened = 0;
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key) => (key === ACCOUNT_KEY ? slot : null) },
  });
  const api = createVkOnlineApi({
    get: async () => null,
    report: async () => null,
    local: async () => {
      opened++;
      slot = '2';
      return store;
    },
  });
  try {
    assert.equal((await api.vkOnline()).ok, false);
    assert.equal(opened, 0);
    slot = '1';
    assert.equal(
      (await api.saveVkOnline({ enabled: true, everyMinutes: 3 })).ok,
      false
    );
    assert.equal(opened, 1);
    assert.equal((await loadVkOnline(store)).settings.enabled, false);
  } finally {
    if (previous === undefined) {
      delete globalThis.sessionStorage;
    } else {
      Object.defineProperty(globalThis, 'sessionStorage', previous);
    }
  }
});
