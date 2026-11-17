import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemoryStore } from '../src/storage/universal.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { loadSettings, saveSettings } from '../src/automation/safety.js';
import { guardedSend } from '../src/automation/outbox.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { runCli } from '../src/cli/index.js';
import { decodeWire } from '../src/transport/lino.js';
import { AUTOMATION_HELP } from '../src/cli/help.js';
import { protectedSettings } from '../../experiments/issue-56/safety-settings-fixture.mjs';

const command = (store, dependencies = {}) => {
  const commands = createAutomationCommands({
    openStore: async () => store,
    createAnswerModel: () => assert.fail('Safety never opens a model'),
    send: () => assert.fail('Safety never sends'),
    ...dependencies,
  });
  return async (action, options = {}) => {
    const output = [];
    const code = await commands.automations(
      { _: ['safety', ...action], ...options },
      (line) => output.push(line)
    );
    return { code, output, text: output.join('\n') };
  };
};

test('safety CLI show is read-only, closes its store and emits default Lino', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  store.put = () => assert.fail('Show cannot write');
  const run = command(null, {
    openStore: () => assert.fail('Show must not acquire the writer'),
    openReadOnly: async (directory) => {
      assert.equal(directory, '/fixture');
      return store;
    },
  });
  const result = await run([], { store: '/fixture' });
  assert.equal(result.code, 0);
  assert.deepEqual(decodeWire(result.text), protectedSettings);
  assert.equal(closed, 1);
});

test('safety CLI configures quiet hours and cooldown without changing opt-outs', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  const run = command(store);
  const result = await run(['configure'], {
    'quiet-enabled': 'true',
    'quiet-from': '23:15',
    'quiet-to': '06:30',
    timezone: 'Europe/Moscow',
    'cooldown-days': '2.5',
    json: true,
  });
  assert.equal(result.code, 0);
  const settings = JSON.parse(result.text);
  assert.deepEqual(settings, {
    quietHours: { enabled: true, from: '23:15', to: '06:30' },
    timezone: 'Europe/Moscow',
    cooldownDays: 2.5,
    optOut: protectedSettings.optOut,
  });
  assert.deepEqual(await loadSettings(store), settings);
  assert.equal(
    (
      await run(['configure'], {
        'quiet-enabled': false,
        timezone: 'local',
        'cooldown-days': 'none',
      })
    ).code,
    0
  );
  assert.deepEqual(await loadSettings(store), {
    ...settings,
    quietHours: { ...settings.quietHours, enabled: false },
    timezone: null,
    cooldownDays: null,
  });
});

test('safety CLI rejects malformed or misplaced options without changing safeguards', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  const run = command(store);
  for (const [action, options] of [
    [['configure'], {}],
    [['configure'], { 'quiet-enabled': 'no' }],
    [['configure'], { 'quiet-from': '24:00' }],
    [['configure'], { 'quiet-to': true }],
    [['configure'], { timezone: 'Not/AZone' }],
    [['configure'], { timezone: true }],
    ...['-1', 'NaN', '', true].map((value) => [
      ['configure'],
      { 'cooldown-days': value },
    ]),
    [['show'], { 'quiet-enabled': false }],
    [['configure'], { 'quiet-fromm': '07:00' }],
    [['opt-out-add'], { source: 'vk' }],
    [['opt-out-add'], { source: 'vk', chat: true }],
    [['opt-out-add'], { source: true, chat: '201' }],
    [['opt-out-add'], { source: 'vk', chat: '201', contact: 'owner' }],
    [['opt-out-add'], { source: 'vk', chat: '201', note: 'x'.repeat(201) }],
    [['opt-out-remove'], { source: 'vk', chat: '201', note: 'ignored?' }],
    [['unknown'], {}],
    [['show', 'extra'], {}],
  ]) {
    const result = await run(action, options);
    assert.equal(result.code, 1, JSON.stringify([action, options]));
    assert.match(result.text, /^error:/u);
    assert.deepEqual(await loadSettings(store), protectedSettings);
  }
});

test('safety CLI changes only the exact provider/chat or contact opt-out', async () => {
  const store = createMemoryStore();
  const other = { source: 'telegram', chat: '201', note: '', at: null };
  await saveSettings(store, {
    ...protectedSettings,
    optOut: [...protectedSettings.optOut, other],
  });
  const run = command(store);
  for (const options of [
    { source: 'vk', chat: '777' },
    { source: 'vk', contact: '777' },
  ]) {
    assert.equal(
      (await run(['opt-out-add'], { ...options, note: 'New owner hold' })).code,
      0
    );
  }
  const before = await loadSettings(store);
  assert.equal(before.optOut.length, 4);
  const at = before.optOut.find((entry) => entry.chat === '777').at;
  assert.equal(
    (
      await run(['opt-out-add'], {
        source: 'vk',
        chat: '777',
        note: 'Updated note',
      })
    ).code,
    0
  );
  const updated = await loadSettings(store);
  assert.equal(updated.optOut.length, 4);
  assert.deepEqual(
    updated.optOut.find((entry) => entry.chat === '777'),
    { source: 'vk', chat: '777', note: 'Updated note', at }
  );
  assert.equal(
    (
      await run(['opt-out-add'], {
        source: 'vk',
        chat: '201',
        note: 'Updated legacy hold',
      })
    ).code,
    0
  );
  assert.equal(
    (await loadSettings(store)).optOut.find(
      (entry) => entry.source === 'vk' && entry.chat === '201'
    ).at,
    null
  );
  assert.equal(
    (await run(['opt-out-remove'], { source: 'vk', chat: '201' })).code,
    0
  );
  assert.deepEqual(
    (await loadSettings(store)).optOut.filter((entry) => entry.chat === '201'),
    [other]
  );
  assert.equal(
    (await run(['opt-out-remove'], { source: 'vk', contact: '777' })).code,
    0
  );
  assert.deepEqual((await loadSettings(store)).optOut, [
    other,
    { source: 'vk', chat: '777', note: 'Updated note', at },
  ]);
});

test('safety CLI persistence refusal returns failure and keeps the final send guard blocked', async () => {
  const store = createMemoryStore();
  await saveSettings(store, protectedSettings);
  let closed = 0;
  store.close = async () => {
    closed++;
  };
  store.flush = async () => {
    throw new Error('Fixture disk refusal');
  };
  const result = await command(store)(['opt-out-remove'], {
    source: 'vk',
    chat: '201',
  });
  assert.deepEqual(result, {
    code: 1,
    output: ['error: Fixture disk refusal'],
    text: 'error: Fixture disk refusal',
  });
  assert.equal(closed, 1);
  assert.deepEqual(await loadSettings(store), protectedSettings);
  const guard = await guardedSend({
    store,
    owner: 'cli-safety',
    draft: { source: 'vk', chat: '201', text: 'Blocked' },
    send: () => assert.fail('Opt-out must block delivery'),
  });
  assert.equal(guard.code, 'opted-out');
});

test('safety CLI opt-out survives actual Lino close and reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-safety-cli-'));
  const file = join(directory, 'settings.lino');
  const open = () => createLinoTextStore(file);
  const run = command(null, { openStore: open, openReadOnly: open });
  try {
    assert.equal(
      (await run(['opt-out-add'], { source: 'hh', contact: 'person' })).code,
      0
    );
    const saved = await run(['show'], { json: true });
    assert.equal(saved.code, 0);
    assert.equal(JSON.parse(saved.text).optOut[0].contact, 'person');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ordinary CLI routing retains safety settings across independent command invocations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-safety-routing-'));
  const invoke = async (args) => {
    const output = [];
    const code = await runCli(
      ['automations', 'safety', ...args, `--store=${directory}`, '--json'],
      { log: (line) => output.push(line) }
    );
    return { code, text: output.join('\n') };
  };
  try {
    const changed = await invoke([
      'configure',
      '--quiet-enabled=false',
      '--cooldown-days=10',
    ]);
    assert.equal(changed.code, 0, changed.text);
    const shown = await invoke(['show']);
    assert.equal(shown.code, 0, shown.text);
    assert.deepEqual(JSON.parse(shown.text), JSON.parse(changed.text));
    assert.equal(JSON.parse(shown.text).cooldownDays, 10);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('automation help exposes safety controls and their global scope', () => {
  for (const text of [
    'safety [show]',
    'quiet-enabled',
    'cooldown-days',
    'opt-out-add',
    'opt-out-remove',
    'every automated send',
  ]) {
    assert.ok(AUTOMATION_HELP.includes(text), text);
  }
});
