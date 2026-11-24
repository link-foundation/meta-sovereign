import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  SETTINGS_ID,
  loadSettings,
  saveSettings,
} from '../src/automation/safety.js';
import { guardedSend } from '../src/automation/outbox.js';
import {
  protectedSettings,
  safetySettingsFixture,
} from '../../experiments/issue-56/safety-settings-fixture.mjs';
import { createAutomationApi } from '../src/web/automation-api.js';
import {
  encodeWire,
  readWireResponse,
  LINO_TEXT,
} from '../src/transport/lino.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { translate } from '../src/web/i18n.js';

test('rejected safety admission restores the acknowledged opt-out', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  const put = store.put.bind(store);
  let refuse = true;
  store.put = async (row) => {
    await put(row);
    if (refuse) {
      refuse = false;
      throw new Error('Admitted memory but refused disk');
    }
    return row;
  };
  await assert.rejects(saveSettings(store, { optOut: [] }), /refused disk/u);
  assert.deepEqual(await loadSettings(store), protectedSettings);
});

test('rejected safety flush restores the previous record or its absence', async () => {
  for (const previous of [null, protectedSettings]) {
    const store = createMemoryStore();
    if (previous) {
      await saveSettings(store, previous);
    }
    store.flush = async () => {
      throw new Error('Flush refused');
    };
    await assert.rejects(saveSettings(store, { optOut: [] }), /Flush refused/u);
    if (previous) {
      assert.deepEqual(await loadSettings(store), previous);
    } else {
      assert.equal(await store.get(SETTINGS_ID), null);
    }
  }
});

test('a guarded send waits for rejected settings and retains the opt-out', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  const entered = Promise.withResolvers();
  const held = Promise.withResolvers();
  store.flush = async () => {
    entered.resolve();
    await held.promise;
  };
  const saving = saveSettings(store, { ...protectedSettings, optOut: [] });
  const rejected = assert.rejects(saving, /Flush refused/u);
  // The unfixed implementation never calls flush. Admit only finite microtasks.
  await Promise.race([entered.promise, saving.catch(() => {})]);
  let sends = 0;
  const sending = guardedSend({
    store,
    owner: 'fixture-settings',
    draft: { source: 'vk', chat: '201', text: 'Must remain blocked' },
    send: async () => {
      sends++;
      return { via: 'fixture' };
    },
  });
  try {
    await Promise.resolve();
    assert.equal(sends, 0);
  } finally {
    held.reject(new Error('Flush refused'));
    await Promise.allSettled([rejected, sending, held.promise]);
  }
  await rejected;
  assert.equal((await sending).code, 'opted-out');
  assert.equal(sends, 0);
  assert.deepEqual(await loadSettings(store), protectedSettings);
});

test('safety saves serialize and recover after a refused acknowledgement', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  let flushes = 0;
  store.flush = async () => {
    if (++flushes === 1) {
      throw new Error('First flush refused');
    }
  };
  const failed = assert.rejects(
    saveSettings(store, { optOut: [] }),
    /refused/u
  );
  const next = { ...protectedSettings, cooldownDays: 30 };
  const saved = saveSettings(store, next);
  await failed;
  assert.deepEqual(await saved, next);
  assert.deepEqual(await loadSettings(store), next);
  assert.equal(flushes, 2);
});

test('acknowledged safety settings survive an actual Lino store reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-safety-settings-'));
  const path = join(directory, 'settings.lino');
  let store;
  try {
    store = await createLinoTextStore(path);
    await saveSettings(store, protectedSettings);
    await store.close();
    store = await createLinoTextStore(path);
    assert.deepEqual(await loadSettings(store), protectedSettings);
  } finally {
    await store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('default Lino settings routes retain safeguards after a flush refusal', async () => {
  const fixture = await safetySettingsFixture();
  const call = async (method, input, origin = fixture.base) => {
    const response = await fetch(`${fixture.base}/api/automations/settings`, {
      method,
      headers: { 'content-type': LINO_TEXT, accept: LINO_TEXT, origin },
      ...(input ? { body: encodeWire(input) } : {}),
    });
    return { status: response.status, body: await readWireResponse(response) };
  };
  try {
    fixture.refuse(true);
    const refused = await call('PUT', { ...protectedSettings, optOut: [] });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error, /flush refused/u);
    assert.deepEqual((await call('GET')).body, protectedSettings);
    fixture.refuse(false);
    const denied = await call('PUT', { optOut: [] }, 'https://foreign.invalid');
    assert.equal(denied.status, 403);
    const next = { ...protectedSettings, cooldownDays: 30 };
    assert.deepEqual((await call('PUT', next)).body, next);
    assert.deepEqual((await call('GET')).body, next);
    assert.deepEqual(fixture.stats(), { sends: 0, liveProvider: false });
  } finally {
    fixture.refuse(false);
    await fixture.close();
  }
});

const webApi = async (request) => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  return { store, api: createAutomationApi({ remote: { request }, store }) };
};

test('safety web keeps browser safeguards after refused or missing receipts', async () => {
  for (const response of [
    { ok: false },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => ({ error: 'Refused' }) },
    { ok: true, json: async () => protectedSettings },
    {
      ok: true,
      json: async () => {
        throw new Error('Broken body');
      },
    },
  ]) {
    const { api, store } = await webApi(async () => response);
    await assert.rejects(
      api.saveSafetySettings({ ...protectedSettings, optOut: [] }),
      { code: 'safety-settings-unconfirmed' }
    );
    assert.deepEqual(await loadSettings(store), protectedSettings);
  }
});

test('safety web never falls back after a connected write loses its response', async () => {
  let calls = 0;
  const { api, store } = await webApi(async (path, init, options) => {
    calls++;
    assert.equal(path, '/api/automations/settings');
    assert.equal(init.method, 'PUT');
    assert.deepEqual(options, { network: true, recover: false });
    throw new Error('Lost acknowledgement');
  });
  await assert.rejects(
    api.saveSafetySettings({ optOut: [] }),
    /Lost acknowledgement/u
  );
  assert.equal(calls, 1);
  assert.deepEqual(await loadSettings(store), protectedSettings);
});

test('safety web connected reads fail visibly without substituting offline settings', async () => {
  for (const response of [
    { ok: false },
    { ok: true, json: async () => ({}) },
    {
      ok: true,
      json: async () => ({ ...protectedSettings, timezone: 'Invalid/Zone' }),
    },
  ]) {
    const { api } = await webApi(async () => response);
    await assert.rejects(api.safetySettings(), {
      code: 'safety-settings-unconfirmed',
    });
  }
});

test('safety web only acknowledges matching server settings without a local mutation', async () => {
  const next = { ...protectedSettings, cooldownDays: 30 };
  const calls = [];
  const { api, store } = await webApi(async (path, init, options) => {
    calls.push({ path, init, options });
    return { ok: true, json: async () => next };
  });
  assert.deepEqual(await api.saveSafetySettings(next), next);
  assert.deepEqual(await api.safetySettings(), next);
  assert.equal(calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].init.body), next);
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].options.recover, true);
  assert.deepEqual(await loadSettings(store), protectedSettings);
});

test('safety web offline changes wait for storage acknowledgement and restore on failure', async () => {
  const { api, store } = await webApi(async () => null);
  store.flush = async () => {
    throw new Error('Offline disk refused');
  };
  await assert.rejects(
    api.saveSafetySettings({ optOut: [] }),
    /Offline disk refused/u
  );
  assert.deepEqual(await api.safetySettings(), protectedSettings);
  store.flush = async () => {};
  const next = { ...protectedSettings, cooldownDays: 30 };
  assert.deepEqual(await api.saveSafetySettings(next), next);
  assert.deepEqual(await api.safetySettings(), next);
});

test('safety acknowledgement feedback is translated in every existing locale', () => {
  const messages = ['en', 'ru', 'hi', 'zh'].map((locale) =>
    translate(locale, 'safety.failed')
  );
  assert.equal(new Set(messages).size, 4);
  assert.ok(
    messages.every((message) => message && message !== 'safety.failed')
  );
});
