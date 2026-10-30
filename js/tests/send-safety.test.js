// R-Z3: every automated send goes through one guarded function: a durable
// outbox record before the send, exactly once, a cooldown, an autopilot
// that stays paused after a restart, quiet hours, an opt-out list, and
// paced, capped, stoppable mass sends with a dry-run preview.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';

import { createMemoryStore } from '../src/storage/index.js';
import { DAY_MS, createReengageSession } from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import { startServer } from '../src/server/index.js';
import {
  automationPresets,
  planAutomation,
} from '../src/automation/automations.js';
import { createAutomationRunner } from '../src/automation/runner.js';
import { autopilotId, createAutopilot } from '../src/automation/autopilot.js';
import {
  guardedSend,
  listOutbox,
  outboxId,
  outboxKey,
  recoverOutbox,
  resolveOutbox,
} from '../src/automation/outbox.js';
import {
  quietMsLeft,
  saveSettings,
  unreachableReason,
} from '../src/automation/safety.js';
import {
  MIN_DELAY_MS,
  planGreetings,
  previewGreetings,
  runGreetings,
} from '../src/greetings/index.js';
import { broadcast } from '../src/broadcast/index.js';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();
const clock = () => new Date(NOW);

let seq = 0;
const m = (chat, sender, body, ago, extra = {}) => ({
  ...buildMessageLink({
    source: 'vk',
    externalId: String((seq += 1)),
    sender,
    chat,
    body,
    timestamp: daysAgo(ago),
  }),
  ...extra,
});

const people = () => [
  m('201', 'me', 'Здравствуйте! Вы свободны?', 120),
  m('201', 'anna', 'Да, слушаю вас', 120),
  m('202', 'me', 'Здравствуйте! Вы сможете?', 200),
  m('202', 'boris', 'Да', 200),
  m('203', 'me', 'Здравствуйте, вы тут?', 300),
  m('203', 'vera', 'Вера', 300),
];

const seeded = async (extra = []) => {
  const store = createMemoryStore();
  for (const link of [...people(), ...extra]) {
    await store.put(link);
  }
  // The fixed clock may sit in somebody's night: quiet hours are tested apart.
  await saveSettings(store, { quietHours: { enabled: false } });
  return store;
};

const reengage = (extra = {}) => ({
  ...automationPresets().find((a) => a.id === 'automation:reengage-dormant'),
  mode: 'auto',
  ...extra,
});

const runnerFor = (store, send) =>
  createAutomationRunner({ store, send, clock, sleep: async () => {} });

const confirmedRun = async (runner, automation, options = {}) => {
  const planned = await runner.plan(automation, options);
  return runner.run(automation, { ...options, confirmed: planned.drafts });
};

// ---- 1. exactly once ------------------------------------------------

test('a "sending" record is durable before the send and "sent" after', async () => {
  const store = await seeded();
  let seen = null;
  const outcome = await guardedSend({
    store,
    owner: 'o',
    draft: { source: 'vk', chat: '1', text: 'hi' },
    clock,
    send: async (draft) => {
      seen = await store.get(outboxId(draft.clientId));
      return { via: 'api' };
    },
  });
  assert.equal(seen.status, 'sending');
  assert.equal(outcome.status, 'sent');
  assert.equal(outcome.outbox.status, 'sent');
  assert.equal(outcome.outbox.key, seen.key);
});

test('nothing is sent when the outbox cannot be written', async () => {
  const store = await seeded();
  const broken = {
    ...store,
    put: async () => {
      throw new Error('disk full');
    },
  };
  let sends = 0;
  const outcome = await guardedSend({
    store: broken,
    draft: { source: 'vk', chat: '1', text: 'hi' },
    clock,
    send: async () => {
      sends += 1;
    },
  });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.code, 'outbox-unavailable');
  assert.equal(sends, 0);
});

test('a send-unknown adapter error is unknown in the outbox and never retried (R-Z4)', async () => {
  const store = await seeded();
  const draft = { source: 'vk', chat: '9', text: 'hi' };
  for (const code of ['send-unknown', 'unknown-delivery']) {
    let sends = 0;
    const d = { ...draft, chat: code };
    const first = await guardedSend({
      store,
      draft: d,
      clock,
      send: async () => {
        sends += 1;
        throw Object.assign(new Error('may have been delivered'), {
          code,
          outcome: 'unknown',
          fallback: false,
        });
      },
    });
    assert.equal(first.status, 'unknown');
    const again = await guardedSend({
      store,
      draft: d,
      clock,
      send: async () => {
        sends += 1;
      },
    });
    assert.equal(again.code, 'send-in-doubt');
    assert.equal(sends, 1);
  }
});

test('a store that refuses the sending record (full disk) sends nothing', async () => {
  const store = await seeded();
  for (const code of ['STORE_WRITE_FAILED', 'STORE_FULL']) {
    let sends = 0;
    const outcome = await guardedSend({
      store: {
        ...store,
        put: async () => {
          throw Object.assign(new Error('no space left'), { code });
        },
      },
      draft: { source: 'vk', chat: code, text: 'hi' },
      clock,
      send: async () => {
        sends += 1;
      },
    });
    assert.equal(outcome.code, 'outbox-unavailable');
    assert.equal(sends, 0);
  }
});

test('a store that fails after a successful send never turns it into failed, and nothing resends', async () => {
  const store = await seeded();
  const flaky = {
    ...store,
    put: async (link) => {
      if (link.id.startsWith('outbox:') && link.status === 'sent') {
        throw new Error('store locked');
      }
      return store.put(link);
    },
  };
  let sends = 0;
  const draft = { source: 'vk', chat: '1', text: 'hi' };
  const send = async () => {
    sends += 1;
    return { via: 'api' };
  };
  const first = await guardedSend({ store: flaky, draft, send, clock });
  assert.equal(first.status, 'sent');
  // The record stayed "sending"; the same send is refused, not repeated.
  const again = await guardedSend({ store: flaky, draft, send, clock });
  assert.equal(again.status, 'failed');
  assert.equal(again.code, 'send-in-doubt');
  assert.equal(sends, 1);
  // After a restart it is "unknown" and still never retried.
  assert.equal(await recoverOutbox(store, { clock }), 1);
  const [record] = await listOutbox(store);
  assert.equal(record.status, 'unknown');
  const third = await guardedSend({ store, draft, send, clock });
  assert.equal(third.code, 'send-in-doubt');
  assert.equal(sends, 1);
});

test('a timeout is unknown, a refusal is failed; unknown is settled by the user only', async () => {
  const store = await seeded();
  const timeout = Object.assign(new Error('request timed out'), {
    code: 'timeout',
  });
  const a = await guardedSend({
    store,
    draft: { source: 'vk', chat: '1', text: 'hi' },
    clock,
    send: async () => {
      throw timeout;
    },
  });
  assert.equal(a.status, 'unknown');
  const b = await guardedSend({
    store,
    draft: { source: 'vk', chat: '2', text: 'hi' },
    clock,
    send: async () => {
      throw Object.assign(new Error('no such chat'), { code: 'unknown-chat' });
    },
  });
  assert.equal(b.status, 'failed');
  // A failed send may be tried again; an unknown one may not.
  const retry = await guardedSend({
    store,
    draft: { source: 'vk', chat: '2', text: 'hi' },
    clock,
    send: async () => ({}),
  });
  assert.equal(retry.status, 'sent');
  await assert.rejects(resolveOutbox(store, a.outbox.id, 'maybe'));
  const settled = await resolveOutbox(store, a.outbox.id, 'sent', { clock });
  assert.equal(settled.status, 'sent');
  assert.equal(settled.resolvedBy, 'user');
});

test('the runner never retries a send in doubt, across a restart', async () => {
  const store = await seeded();
  let sends = 0;
  const send = async () => {
    sends += 1;
    throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
  };
  const automation = reengage({ limit: 1 });
  const first = await confirmedRun(runnerFor(store, send), automation);
  assert.equal(first.results[0].status, 'unknown');
  assert.equal(first.stopped, 'unknown-send');
  // A restarted server, a new runner, another run: the chat is held back.
  await recoverOutbox(store, { clock });
  const second = await runnerFor(store, send).plan(automation);
  const held = second.excluded.find((e) => e.reason === 'send-unconfirmed');
  assert.ok(held, 'the chat waits for the user');
  assert.ok(!second.drafts.some((d) => d.chat === held.key.split(':')[1]));
  const before = sends;
  await confirmedRun(runnerFor(store, send), automation);
  assert.ok(sends - before <= 1, 'only another chat is tried');
});

test('a failing store write after a runner send keeps it "sent"', async () => {
  const store = await seeded();
  const flaky = {
    ...store,
    put: async (link) => {
      if (link.id.startsWith('msg:') || link.id.startsWith('automation-run:')) {
        throw new Error('store locked');
      }
      return store.put(link);
    },
  };
  let sends = 0;
  const runner = createAutomationRunner({
    store: flaky,
    send: async () => {
      sends += 1;
      return { via: 'api' };
    },
    clock,
    sleep: async () => {},
  });
  const automation = reengage({ limit: 1 });
  const out = await confirmedRun(runner, automation);
  assert.equal(out.results[0].status, 'sent');
  assert.equal(sends, 1);
  const [record] = await listOutbox(store);
  assert.equal(record.status, 'sent');
  // The same chat is not messaged again by the next run.
  const again = await confirmedRun(runner, automation);
  assert.ok(again.results.every((r) => r.draft.chat !== record.chat));
});

// ---- 2. cooldown ----------------------------------------------------

test('default conditions never message the same chat again within the cooldown, across restarts', async () => {
  const store = await seeded();
  const sent = [];
  const send = async (draft) => {
    sent.push(draft.chat);
    return { via: 'api' };
  };
  // Default conditions: no silence and no cooldown configured.
  const automation = reengage({
    conditions: { silentDays: 0, cooldownDays: null },
    limit: 0,
  });
  await confirmedRun(runnerFor(store, send), automation);
  assert.deepEqual([...sent].sort(), ['201', '202', '203']);
  // Another run, then a new runner (a restart): nothing goes out twice.
  await confirmedRun(runnerFor(store, send), automation);
  await confirmedRun(runnerFor(store, send), automation);
  assert.equal(sent.length, 3);
  // The outbox alone holds the cooldown, even without the run records.
  for (const link of await store.query((l) =>
    l.id.startsWith('automation-run:')
  )) {
    await store.delete(link.id);
  }
  const plan = planAutomation(await store.query(), automation, { now: NOW });
  assert.equal(plan.drafts.length, 0);
  assert.ok(plan.excluded.every((e) => e.reason === 'already-sent'));
  // After the cooldown (7 days) they are due again; a configured one wins.
  const later = planAutomation(await store.query(), automation, {
    now: NOW + 8 * DAY_MS,
  });
  assert.equal(later.drafts.length, 3);
  const short = reengage({ conditions: { silentDays: 0, cooldownDays: 1 } });
  assert.equal(
    planAutomation(await store.query(), short, { now: NOW + 2 * DAY_MS }).drafts
      .length,
    3
  );
});

test('two overlapping runs send each chat once and count the daily cap together', async () => {
  const store = await seeded();
  const sent = [];
  const send = async (draft) => {
    sent.push(draft.chat);
    return {};
  };
  const automation = reengage({
    conditions: { silentDays: 0 },
    pacing: { dailyCap: 2, minDelayMs: 0, maxDelayMs: 0, typing: false },
    limit: 0,
  });
  const runner = runnerFor(store, send);
  const planned = (await runner.plan(automation)).drafts;
  await Promise.all([
    runner.run(automation, { confirmed: planned }),
    runner.run(automation, { confirmed: planned }),
  ]);
  assert.equal(new Set(sent).size, sent.length, 'no chat twice');
  assert.ok(sent.length <= 2, `daily cap holds: ${sent.length}`);
});

// ---- 3. autopilot ---------------------------------------------------

const settledState = async (store, automation) => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const state = await store.get(autopilotId(automation));
    if (state && !state.on) {
      return state;
    }
    // A real deadline permits paced planning on every supported runtime.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('the autopilot did not finish');
};

const pilotOver = (store, send, extra = {}) => {
  const runner = runnerFor(store, send);
  return {
    runner,
    autopilot: createAutopilot({
      store,
      runner,
      clock,
      sleep: async () => {},
      random: () => 0,
      ...extra,
    }),
  };
};

test('after a restart the autopilot stays paused until the user resumes it', async () => {
  const store = await seeded();
  const automation = reengage({ conditions: { silentDays: 0 } });
  await store.put(automation);
  const sent = [];
  const send = async (draft) => {
    sent.push(draft.chat);
    return {};
  };
  await store.put({
    id: autopilotId(automation),
    tokens: ['automation-autopilot', 'reengage-dormant'],
    automation: automation.id,
    on: true,
    status: 'waiting',
  });
  const { autopilot } = pilotOver(store, send);
  await autopilot.resume();
  const state = await store.get(autopilotId(automation));
  assert.equal(state.on, false);
  assert.equal(state.status, 'paused');
  assert.equal(state.error, 'paused-after-restart');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, [], 'nothing was sent by itself');
  // Explicitly set to resume on start: it goes on.
  await store.put({ ...state, on: true, resumeOnStart: true });
  await autopilot.resume();
  const done = await settledState(store, automation);
  assert.equal(done.status, 'done');
  assert.equal(sent.length, 3);
});

test('quiet hours in the user timezone hold the autopilot back', async () => {
  const settings = {
    quietHours: { enabled: true, from: '22:00', to: '08:00' },
    timezone: 'UTC',
  };
  const at = (iso) => Date.parse(iso);
  assert.equal(quietMsLeft(at('2026-10-01T12:00:00Z'), settings), 0);
  assert.equal(
    quietMsLeft(at('2026-10-01T23:00:00Z'), settings),
    9 * 3_600_000
  );
  assert.equal(quietMsLeft(at('2026-10-02T07:30:00Z'), settings), 30 * 60_000);
  // The same instant is daytime in Tokyo (08:00 and later is open).
  assert.equal(
    quietMsLeft(at('2026-10-01T23:00:00Z'), {
      ...settings,
      timezone: 'Asia/Tokyo',
    }),
    0
  );
  assert.equal(
    quietMsLeft(at('2026-10-01T23:00:00Z'), {
      ...settings,
      quietHours: { enabled: false, from: '22:00', to: '08:00' },
    }),
    0
  );

  // The autopilot rests through the night and sends nothing.
  const store = await seeded();
  await saveSettings(store, settings);
  const automation = reengage({ conditions: { silentDays: 0 } });
  await store.put(automation);
  const sent = [];
  const rests = [];
  const { autopilot } = pilotOver(store, async (d) => sent.push(d.chat), {
    clock: () => new Date('2026-10-01T23:00:00Z'),
    sleep: async (ms, signal) => {
      rests.push(ms);
      // stay asleep until stopped, like a real timer would
      await new Promise((resolve) => signal.addEventListener('abort', resolve));
      throw new Error('aborted');
    },
  });
  await autopilot.start(automation.id);
  for (let i = 0; i < 50 && rests.length === 0; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const state = await store.get(autopilotId(automation));
  assert.equal(state.status, 'quiet');
  assert.equal(rests[0], 9 * 3_600_000);
  assert.deepEqual(sent, []);
  await autopilot.stop(automation.id);
});

test('the opt-out list and unreachable chats are never planned or sent', async () => {
  const extra = [
    m('301', 'me', 'Здравствуйте', 150),
    m('301', 'bot1', 'I am a bot', 150, { bot: true }),
    m('302', 'me', 'Здравствуйте', 150),
    m('302', 'carl', 'Нет', 150, { blocked: true }),
    m('303', 'me', 'Здравствуйте', 150),
    m('303', 'dan', 'Ок', 150, { left: true }),
    m('304', 'me', 'Здравствуйте', 150),
    m('304', 'eve', 'Ок', 150, { deletedAccount: true }),
    m('305', 'me', 'Здравствуйте', 150),
    m('305', 'fay', 'Ок', 150, { chatType: 'channel' }),
  ];
  const store = await seeded(extra);
  await saveSettings(store, {
    quietHours: { enabled: false },
    optOut: [{ source: 'vk', chat: '201', note: 'asked not to' }],
  });
  const automation = reengage({ conditions: { silentDays: 0 }, limit: 0 });
  const plan = planAutomation(await store.query(), automation, { now: NOW });
  assert.deepEqual(plan.drafts.map((d) => d.chat).sort(), ['202', '203']);
  const why = Object.fromEntries(plan.excluded.map((e) => [e.key, e.reason]));
  assert.equal(why['vk:201'], 'opted-out');
  assert.equal(why['vk:301'], 'bot');
  assert.equal(why['vk:302'], 'blocked');
  assert.equal(why['vk:303'], 'left');
  assert.equal(why['vk:304'], 'deleted-account');
  // A channel is no personal chat; picked by hand from its menu it is refused.
  const picked = planAutomation(await store.query(), automation, {
    now: NOW,
    targets: [{ source: 'vk', chat: '305' }],
  });
  assert.equal(picked.excluded[0].reason, 'channel');
  assert.equal(unreachableReason([{ senderDeleted: true }]), 'deleted-account');
  // Even a direct send to an opted-out chat is refused by the one guard.
  let sends = 0;
  const refused = await guardedSend({
    store,
    draft: { source: 'vk', chat: '201', text: 'hi' },
    clock,
    send: async () => {
      sends += 1;
    },
  });
  assert.equal(refused.code, 'opted-out');
  assert.equal(sends, 0);
});

// ---- 4. greetings and mass sends -----------------------------------

const envelopes = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    network: 'vk',
    chat: String(100 + i),
    contact: String(100 + i),
    kind: 'text',
    text: 'Hi!',
    ...extra,
  }));

const fakeSources =
  (calls, fail = () => null) =>
  () => ({
    live: {
      async post(content) {
        calls.push(content.chat);
        const error = fail(content.chat);
        if (error) {
          throw error;
        }
        return { ok: true };
      },
    },
  });

const runWith = (plan, options = {}) => {
  const sleeps = [];
  const calls = [];
  const store = options.store ?? createMemoryStore();
  return {
    sleeps,
    calls,
    store,
    run: () =>
      runGreetings(plan, {
        store,
        resolveSource: fakeSources(calls, options.fail),
        sleep: async (ms) => sleeps.push(ms),
        random: () => 0.5,
        clock,
        ...options.run,
      }),
  };
};

test('greetings pause between sends with a floor and jitter', async () => {
  const a = runWith({ envelopes: envelopes(3) }, { run: { delayMs: 0 } });
  await a.run();
  assert.deepEqual(a.sleeps, [MIN_DELAY_MS, MIN_DELAY_MS]);
  const jittered = [];
  const b = runWith(
    { envelopes: envelopes(4) },
    {
      run: { delayMs: 30_000, random: () => Math.random() },
    }
  );
  await b.run();
  jittered.push(...b.sleeps);
  assert.equal(jittered.length, 3);
  assert.ok(jittered.every((ms) => ms >= 22_500 && ms <= 37_500));
  assert.ok(new Set(jittered).size > 1, 'the pauses differ');
});

test('greetings stop at the daily cap and the per-request maximum', async () => {
  const perRun = runWith(
    { envelopes: envelopes(6) },
    { run: { maxPerRun: 2 } }
  );
  const out = await perRun.run();
  assert.deepEqual(perRun.calls, ['100', '101']);
  assert.deepEqual(
    out.slice(2).map((r) => r.skipped),
    ['run-limit', 'run-limit', 'run-limit', 'run-limit']
  );
  // The day is shared between requests: the outbox counts what went out.
  const day = runWith({ envelopes: envelopes(3) }, { run: { dailyCap: 2 } });
  await day.run();
  assert.equal(day.calls.length, 2);
  const next = runWith(
    { envelopes: envelopes(5).slice(2) },
    { store: day.store, run: { dailyCap: 2 } }
  );
  const held = await next.run();
  assert.deepEqual(next.calls, []);
  assert.ok(held.every((r) => r.skipped));
});

test('a rate limit stops the whole batch', async () => {
  const flood = Object.assign(new Error('FLOOD_WAIT_30'), {
    code: 'flood-wait',
    retryAfter: 30,
  });
  const t = runWith(
    { envelopes: envelopes(5) },
    {
      fail: (chat) => (chat === '101' ? flood : null),
    }
  );
  const out = await t.run();
  assert.deepEqual(t.calls, ['100', '101']);
  assert.equal(out[1].code, 'flood-wait');
  assert.ok(
    out.slice(2).every((r) => r.skipped === 'batch-stopped:flood-wait')
  );
});

test('N failures in a row stop the batch; a success resets the count', async () => {
  const bad = () => new Error('refused');
  const t = runWith(
    { envelopes: envelopes(8) },
    {
      fail: (chat) =>
        ['100', '101', '103', '104', '105'].includes(chat) ? bad() : null,
    }
  );
  const out = await t.run();
  // 100,101 fail, 102 succeeds (reset), 103,104,105 fail: stop.
  assert.deepEqual(t.calls, ['100', '101', '102', '103', '104', '105']);
  assert.ok(
    out.slice(6).every((r) => r.skipped === 'batch-stopped:too-many-failures')
  );
});

test('a dry run lists exactly who gets what, sending and recording nothing', async () => {
  const store = createMemoryStore();
  const plan = {
    mode: 'initiate',
    envelopes: [
      ...envelopes(3),
      { network: 'vk', chat: '999', skipped: 'outside-messaging-window' },
    ],
  };
  const preview = await previewGreetings(plan, {
    store,
    clock,
    maxPerRun: 2,
    delayMs: 0,
  });
  assert.equal(preview.dryRun, true);
  assert.deepEqual(
    preview.willSend.map((e) => e.chat),
    ['100', '101']
  );
  assert.deepEqual(
    preview.held.map((e) => [e.chat, e.held]),
    [
      ['102', 'run-limit'],
      ['999', 'outside-messaging-window'],
    ]
  );
  assert.equal(preview.limits.delayMs, MIN_DELAY_MS);
  assert.deepEqual(await store.query(), []);
  // The real run sends exactly that list.
  const t = runWith(plan, { store, run: { maxPerRun: 2 } });
  await t.run();
  assert.deepEqual(
    t.calls,
    preview.willSend.map((e) => e.chat)
  );
});

test('a greeting goes out once: the outbox refuses the same chat again', async () => {
  const t = runWith({ envelopes: envelopes(1) });
  await t.run();
  const again = runWith({ envelopes: envelopes(1) }, { store: t.store });
  const out = await again.run();
  assert.deepEqual(again.calls, []);
  assert.equal(out[0].ok, false);
  // A failing store after the send does not turn the greeting into a failure.
  const flaky = createMemoryStore();
  const put = flaky.put.bind(flaky);
  flaky.put = async (link) => {
    if (link.id.startsWith('greeting:')) {
      throw new Error('locked');
    }
    return put(link);
  };
  const ok = runWith(
    { envelopes: envelopes(1, { chat: '7' }) },
    { store: flaky }
  );
  const [result] = await ok.run();
  assert.equal(result.ok, true);
});

test('the 24-hour window applies to WhatsApp Cloud API sends only', () => {
  const links = [
    buildMessageLink({
      source: 'whatsapp',
      externalId: 'w1',
      chat: '1555',
      sender: '1555',
      body: 'Hello',
      timestamp: new Date(NOW - 30 * 3_600_000).toISOString(),
    }),
  ];
  const personal = planGreetings({ links, now: NOW });
  assert.equal(personal.envelopes[0].skipped, undefined);
  const business = planGreetings({
    links,
    now: NOW,
    rules: { business: ['whatsapp'] },
  });
  assert.equal(business.envelopes[0].skipped, 'outside-messaging-window');
  // Messenger keeps its window either way.
  const facebook = planGreetings({
    links: [{ ...links[0], id: 'msg:facebook:f1', source: 'facebook' }],
    now: NOW,
  });
  assert.equal(facebook.envelopes[0].skipped, 'outside-messaging-window');
});

test('the greeting planner leaves out the opt-out list and unreachable chats', () => {
  const links = [
    m('1', '1', 'Ok', 20),
    m('2', '2', 'Ok', 20, { blocked: true }),
    m('3', '3', 'Ok', 20),
  ];
  const plan = planGreetings({
    links,
    now: NOW,
    rules: { settings: { optOut: [{ source: 'vk', chat: '3' }] } },
  });
  const by = Object.fromEntries(plan.envelopes.map((e) => [e.chat, e.skipped]));
  assert.equal(by['1'], undefined);
  assert.equal(by['2'], 'blocked');
  assert.equal(by['3'], 'opted-out');
});

// ---- 5. one guarded function everywhere ----------------------------

test('a re-engage session cannot send one draft twice or retry one in doubt', async () => {
  let sends = 0;
  const drafts = [
    { source: 'vk', chat: '1', contact: '1', text: 'a' },
    { source: 'vk', chat: '2', contact: '2', text: 'b' },
  ];
  const outbox = createMemoryStore();
  const session = createReengageSession({
    drafts,
    outbox,
    clock,
    send: async (draft) => {
      sends += 1;
      if (draft.chat === '2') {
        throw Object.assign(new Error('x'), { code: 'timeout' });
      }
      return {};
    },
  });
  assert.equal((await session.confirm()).status, 'sent');
  const doubt = await session.confirm();
  assert.equal(doubt.status, 'failed');
  assert.equal(doubt.outcome, 'unknown');
  assert.equal(session.progress().done, true, 'not offered again');
  assert.equal(sends, 2);
  // A second session over the same outbox cannot send them again.
  const again = createReengageSession({
    drafts,
    outbox,
    clock,
    send: async () => {
      sends += 1;
    },
  });
  assert.equal((await again.confirm()).status, 'failed');
  assert.equal(sends, 2);
});

test('broadcast goes through the guard: once a day, never to opted-out chats', async () => {
  const store = createMemoryStore();
  await saveSettings(store, { optOut: [{ source: 'vk', chat: 'c1' }] });
  const posts = [];
  const resolveSource = () => ({
    live: {
      post: async (content) => {
        posts.push(content);
        return { ok: true };
      },
    },
  });
  const optedOut = await broadcast(
    ['vk'],
    { chat: 'c1', text: 'hi' },
    {
      store,
      resolveSource,
    }
  );
  assert.equal(optedOut[0].code, 'opted-out');
  assert.deepEqual(posts, []);
  const text = { chat: 'c2', text: 'hi' };
  const first = await broadcast(['vk'], text, { store, resolveSource });
  const second = await broadcast(['vk'], text, { store, resolveSource });
  assert.equal(first[0].ok, true);
  assert.equal(second[0].ok, false);
  assert.equal(posts.length, 1);
  const [record] = await listOutbox(store);
  assert.equal(record.kind, 'broadcast');
  assert.equal(record.status, 'sent');
});

// ---- 6. the server --------------------------------------------------

const boot = async (store) => {
  const sent = [];
  const server = await startServer({
    store,
    enableSync: false,
    enableHandlers: false,
    automations: {
      scheduler: false,
      send: async (draft) => {
        sent.push(draft);
        return { via: 'api' };
      },
    },
  });
  const call = async (method, path, body) => {
    const res = await fetch(`http://127.0.0.1:${server.port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { server, call, sent };
};

test('starting the server turns a send that never finished into unknown; the page lists and settles it', async () => {
  const store = createMemoryStore();
  await store.put({
    id: outboxId('x:vk:9:abc:2026-10-01'),
    tokens: ['outbox', 'automation', 'vk'],
    kind: 'automation',
    key: 'x:vk:9:abc:2026-10-01',
    owner: 'automation:x',
    source: 'vk',
    chat: '9',
    text: 'hello',
    status: 'sending',
    at: new Date().toISOString(),
  });
  const { server, call, sent } = await boot(store);
  try {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const listed = await call('GET', '/api/automations/outbox');
    assert.equal(listed.body.outbox.length, 1);
    assert.equal(listed.body.outbox[0].status, 'unknown');
    assert.deepEqual(sent, [], 'recovery never sends');
    const only = await call('GET', '/api/automations/outbox?status=sent');
    assert.deepEqual(only.body.outbox, []);
    const bad = await call('POST', '/api/automations/outbox/resolve', {
      id: listed.body.outbox[0].id,
      decision: 'maybe',
    });
    assert.equal(bad.status, 400);
    const ok = await call('POST', '/api/automations/outbox/resolve', {
      id: listed.body.outbox[0].id,
      decision: 'failed',
    });
    assert.equal(ok.body.outbox.status, 'failed');
  } finally {
    await server.close();
  }
});

test('quiet hours and the opt-out list are saved and read back through the API', async () => {
  const store = createMemoryStore();
  const { server, call } = await boot(store);
  try {
    const defaults = await call('GET', '/api/automations/settings');
    assert.equal(defaults.body.quietHours.enabled, true);
    assert.equal(defaults.body.quietHours.from, '22:00');
    assert.equal(defaults.body.quietHours.to, '08:00');
    const saved = await call('PUT', '/api/automations/settings', {
      quietHours: { enabled: true, from: '23:30', to: '07:00' },
      timezone: 'Europe/Moscow',
      optOut: [{ source: 'vk', chat: '5', note: 'friend' }, { source: '' }],
    });
    assert.equal(saved.body.timezone, 'Europe/Moscow');
    assert.equal(saved.body.optOut.length, 1);
    const read = await call('GET', '/api/automations/settings');
    assert.equal(read.body.quietHours.from, '23:30');
    assert.equal(read.body.optOut[0].chat, '5');
    const bad = await call('PUT', '/api/automations/settings', {
      timezone: 'Not/AZone',
    });
    assert.equal(bad.body.timezone, null);
  } finally {
    await server.close();
  }
});

test('outboxKey is deterministic and varies by chat and day', () => {
  const base = { owner: 'a', source: 'vk', chat: '1', now: NOW };
  assert.equal(outboxKey(base), outboxKey({ ...base }));
  assert.notEqual(outboxKey(base), outboxKey({ ...base, chat: '2' }));
  assert.notEqual(outboxKey(base), outboxKey({ ...base, now: NOW + DAY_MS }));
});
