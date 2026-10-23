// R-Y86 / R-Y87: after a draft is sent the next chat the automation fits
// is offered with the user's edited text; the autopilot goes through
// every chat that fits by itself, and its state says where it is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createMemoryStore } from '../src/storage/index.js';
import { DAY_MS, renderReengageText } from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import {
  automationPresets,
  editAfterSend,
  templateFromText,
} from '../src/automation/automations.js';
import { saveSettings } from '../src/automation/safety.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import {
  afterFailure,
  autopilotId,
  createAutopilot,
} from '../src/automation/autopilot.js';
import { shownAutopilot } from '../src/web/chat-state.js';
import { autopilotText } from '../src/web/chat-view.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();

let seq = 0;
const m = (chat, sender, senderName, body, ago) =>
  buildMessageLink({
    source: 'vk',
    externalId: String((seq += 1)),
    sender,
    senderName,
    chatName: senderName === 'me' ? undefined : senderName,
    chat,
    body,
    timestamp: daysAgo(ago),
  });

// Three people we have not talked to for long, all on "вы".
const fixture = () => [
  m('201', 'me', 'me', 'Здравствуйте! Вы свободны?', 120),
  m('201', 'anna', 'Анна Петрова', 'Да, слушаю вас', 120),
  m('201', 'anna', 'Анна Петрова', 'Вы правы', 119),
  m('202', 'me', 'me', 'Здравствуйте! Вы сможете?', 200),
  m('202', 'boris', 'Борис Иванов', 'Да', 200),
  m('203', 'me', 'me', 'Здравствуйте, вы тут?', 300),
  m('203', 'vera', 'Вера', 'Да', 300),
];

const seeded = async () => {
  const store = createMemoryStore();
  for (const link of fixture()) {
    await store.put(link);
  }
  // The fixed clock sits in somebody's night: quiet hours are tested apart.
  await saveSettings(store, { quietHours: { enabled: false } });
  return store;
};

const reengage = () =>
  automationPresets().find((a) => a.id === 'automation:reengage-dormant');

const runnerFor = (store, send) =>
  createAutomationRunner({
    store,
    send,
    clock: () => new Date(NOW),
    sleep: async () => {},
  });

test('the text the user sent becomes a template: their name stands for the next', () => {
  const draft = { name: 'Анна Петрова', form: 'formal' };
  assert.equal(
    templateFromText('Здравствуйте, Анна! Анна Петрова, как дела?', draft),
    'Здравствуйте, {first}! {name}, как дела?'
  );
  // Not inside another word.
  assert.equal(templateFromText('Анналы', { name: 'Анна' }), 'Анналы');
  assert.equal(
    renderReengageText('Здравствуйте, {first}!', { name: 'Борис Иванов' }),
    'Здравствуйте, Борис!'
  );
  const automation = reengage();
  const own = renderReengageText(automation.action.templates.formal, draft);
  assert.equal(
    editAfterSend(automation, null, draft, own, 'now'),
    null,
    'sent as written: nothing to keep'
  );
  const kept = editAfterSend(
    automation,
    null,
    draft,
    'Добрый день, Анна!',
    'now'
  );
  assert.deepEqual(kept.templates, { formal: 'Добрый день, {first}!' });
  assert.equal(
    editAfterSend(automation, kept, draft, own, 'later'),
    null,
    'sending its own text again forgets the edit'
  );
});

test('after a send the next chat it fits comes with the same edit (R-Y86)', async () => {
  const store = await seeded();
  const sent = [];
  const runner = runnerFor(store, async (draft) => {
    sent.push(draft);
    return { via: 'api' };
  });
  const run = await runner.run(reengage().id, {
    targets: [{ source: 'vk', chat: '201' }],
  });
  const [draft] = run.queued;
  assert.equal(draft.form, 'formal');
  assert.equal(draft.edited, false);
  await runner.sendDraft(draft.id, {
    confirm: true,
    text: 'Добрый день, Анна! Есть минутка?',
  });
  const next = await runner.next(reengage().id, {
    exclude: [{ source: 'vk', chat: '201' }],
  });
  assert.ok(next.draft, 'another chat fits');
  assert.notEqual(next.draft.chat, '201');
  assert.equal(next.draft.edited, true);
  assert.match(next.draft.text, /^Добрый день, (Борис|Вера)! Есть минутка\?$/);
  // Nothing written until it is opened.
  assert.equal((await runner.drafts({ chat: next.draft.chat })).length, 0);
  const queued = await runner.next(reengage().id, { queue: true });
  assert.equal((await runner.drafts({ chat: queued.draft.chat })).length, 1);
  // Back to the automation's own text.
  await runner.resetEdit(reengage().id);
  const again = await runner.next(reengage().id, {
    exclude: [{ source: 'vk', chat: queued.draft.chat }],
  });
  assert.equal(again.draft?.edited ?? false, false);
});

test('a failed send says what to do next', () => {
  assert.deepEqual(afterFailure({ code: 'unknown-chat' }), { next: true });
  assert.deepEqual(afterFailure({ code: 'flood-wait', retryAfter: 30 }), {
    wait: 30_000,
  });
  assert.deepEqual(afterFailure({ code: 'network' }), { pause: true });
});

// Runs the autopilot until it is off; returns its final state.
const settled = async (store, automation) => {
  for (let i = 0; i < 200; i += 1) {
    const state = await store.get(autopilotId(automation));
    if (state && !state.on) {
      return state;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('the autopilot did not finish');
};

test('the autopilot writes to every chat that fits, passing over one it cannot reach (R-Y87)', async () => {
  const store = await seeded();
  const order = [];
  const runner = runnerFor(store, async (draft) => {
    order.push(draft.chat);
    if (draft.chat === '202') {
      throw Object.assign(new Error('no such chat'), { code: 'unknown-chat' });
    }
    return { via: 'api' };
  });
  const seen = [];
  store.subscribe((event) => {
    if (event.link?.id === autopilotId(reengage()) && event.link.current) {
      seen.push(event.link.current.chat);
    }
  });
  const pauses = [];
  const autopilot = createAutopilot({
    store,
    runner,
    clock: () => new Date(NOW),
    sleep: async (ms) => pauses.push(ms),
    random: () => 0,
  });
  const started = await autopilot.start(reengage().id, { monitor: true });
  assert.equal(started.on, true);
  assert.equal(started.monitor, true);
  const state = await settled(store, reengage());
  assert.equal(state.status, 'done');
  assert.equal(state.sent, 2);
  assert.equal(state.failed, 1);
  assert.deepEqual([...order].sort(), ['201', '202', '203']);
  assert.deepEqual([...new Set(seen)].sort(), ['201', '202', '203']);
  // Paced as the automation says (random() = 0: the shortest pause).
  assert.ok(pauses.every((ms) => ms === reengage().pacing.minDelayMs));
});

test('the autopilot pauses when the network is down, and stops when told', async () => {
  const store = await seeded();
  const runner = runnerFor(store, async () => {
    throw Object.assign(new Error('offline'), { code: 'network' });
  });
  const autopilot = createAutopilot({
    store,
    runner,
    clock: () => new Date(NOW),
    sleep: async () => {},
  });
  await autopilot.start(reengage().id);
  const state = await settled(store, reengage());
  assert.equal(state.status, 'paused');
  assert.equal(state.error, 'network');

  let release = null;
  const waiting = createAutopilot({
    store,
    runner: runnerFor(store, async () => ({ via: 'api' })),
    clock: () => new Date(NOW),
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        release = resolve;
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  });
  await waiting.start(reengage().id);
  while (!release) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const stopped = await waiting.stop(reengage().id);
  assert.equal(stopped.on, false);
  assert.equal(stopped.status, 'stopped');
  const monitor = await waiting.monitor(reengage().id, false);
  assert.equal(monitor.monitor, false);
});

test('the chat shows the autopilot that is on, then the last one until closed', () => {
  const on = { id: 'a', on: true, updatedAt: '2' };
  const done = { id: 'b', on: false, status: 'done', updatedAt: '3' };
  assert.equal(shownAutopilot([on, done]), on);
  assert.equal(shownAutopilot([done]), done);
  assert.equal(shownAutopilot([done], '3'), null);
  assert.equal(
    shownAutopilot([{ ...done, status: 'stopped' }]),
    null,
    'stopped by the user: nothing to tell'
  );
  const t = (key, values) => `${key}${JSON.stringify(values ?? {})}`;
  assert.match(
    autopilotText(t, { status: 'sending', current: { name: 'Вера' } }),
    /sending.*Вера/
  );
  assert.match(autopilotText(t, { status: 'waiting' }, 12), /"seconds":12/);
});
