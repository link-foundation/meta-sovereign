// Issue #31 / PR #34: automations are configurable trigger → audience →
// conditions → action rules. The 90-day "say hi" request is one preset:
// safe mode drafts one confirmed message at a time, auto mode sends paced
// like a person (typing status, random pauses, daily cap), and the
// scheduler fires schedule and incoming triggers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/index.js';
import { DAY_MS } from '../src/crm/reengage.js';
import { buildMessageLink } from '../src/sources/link.js';
import {
  automationPresets,
  normalizeAutomation,
  parseDuration,
  planAutomation,
} from '../src/automation/automations.js';
import {
  ConfirmationRequiredError,
  createAutomationRunner,
  createAutomationScheduler,
  typingDurationMs,
} from '../src/automation/runner.js';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();

let seq = 0;
const m = (chat, sender, body, ago, extra = {}) =>
  buildMessageLink({
    source: 'vk',
    externalId: String((seq += 1)),
    sender,
    chat,
    body,
    timestamp: daysAgo(ago),
    ...extra,
  });

const fixture = () => [
  m('101', 'me', 'Привет! Как ты?', 125),
  m('101', 'alice', 'Норм, а ты что делаешь?', 120),
  m('102', 'me', 'Здравствуйте! Вы сможете прислать ваше резюме?', 200),
  m('102', 'bob', 'Да, конечно', 200),
  m('103', 'me', 'Привет', 10),
  m('103', 'carol', 'Привет!', 10),
  m('2000000001', 'me', 'Всем привет', 300),
  m('2000000001', 'dave', 'Привет', 300),
  m('104', 'spam', 'Купи', 400),
];

const seeded = async (links = fixture()) => {
  const store = createMemoryStore();
  for (const link of links) {
    await store.put(link);
  }
  return store;
};

const preset = (id) => automationPresets().find((a) => a.id.endsWith(id));
const clockAt = (ms) => {
  const state = { now: ms };
  return { state, clock: () => new Date(state.now) };
};

test('parseDuration accepts units and plain milliseconds', () => {
  assert.equal(parseDuration('30m'), 30 * 60_000);
  assert.equal(parseDuration('12h'), 12 * 3_600_000);
  assert.equal(parseDuration('1d'), DAY_MS);
  assert.equal(parseDuration('2w'), 14 * DAY_MS);
  assert.equal(parseDuration(5000), 5000);
  assert.throws(() => parseDuration('soon'));
});

test('normalizeAutomation fills defaults and rejects bad input', () => {
  const a = normalizeAutomation({ name: 'Hello there' });
  assert.equal(a.id, 'automation:hello-there');
  assert.equal(a.mode, 'safe');
  assert.deepEqual(a.triggers, [{ kind: 'manual' }]);
  assert.equal(a.audience.kind, 'personal');
  assert.equal(a.pacing.charsPerMinute, 450);
  assert.throws(() => normalizeAutomation({ mode: 'yolo' }), /unknown mode/);
  assert.throws(
    () => normalizeAutomation({ triggers: [{ kind: 'cron' }] }),
    /unknown trigger/
  );
  assert.throws(
    () => normalizeAutomation({ triggers: [{ kind: 'schedule' }] }),
    Error
  );
  assert.throws(
    () => normalizeAutomation({ action: { templates: { informal: ' ' } } }),
    /at least one template/
  );
});

test('the 90-day preset drafts the issue texts with ты/вы detected', () => {
  const plan = planAutomation(fixture(), preset('reengage-dormant'), {
    now: NOW,
  });
  const byContact = Object.fromEntries(plan.drafts.map((d) => [d.contact, d]));
  assert.deepEqual(Object.keys(byContact).sort(), ['alice', 'bob']);
  assert.equal(byContact.alice.form, 'informal');
  assert.match(byContact.alice.text, /^Привет\n/);
  assert.match(byContact.alice.text, /Тебе/);
  assert.equal(byContact.bob.form, 'formal');
  assert.match(byContact.bob.text, /^Здравствуйте\n/);
  assert.match(byContact.bob.text, /Вам/);
  const reasons = Object.fromEntries(
    plan.excluded.map((e) => [e.key, e.reason])
  );
  assert.equal(reasons['vk:103'], 'talked-recently');
  assert.equal(reasons['vk:104'], 'not-mutual');
});

test('targets narrow the plan; a group chat is not personal', () => {
  const automation = preset('reengage-dormant');
  const plan = planAutomation(fixture(), automation, {
    now: NOW,
    targets: [
      { source: 'vk', chat: '101' },
      { source: 'vk', chat: '2000000001' },
    ],
  });
  assert.deepEqual(
    plan.drafts.map((d) => d.chat),
    ['101']
  );
  assert.deepEqual(plan.excluded, [
    { key: 'vk:2000000001', name: null, reason: 'not-personal' },
  ]);
  const groups = planAutomation(
    fixture(),
    { ...automation, conditions: { personal: false, silentDays: 0 } },
    { now: NOW, targets: [{ source: 'vk', chat: '2000000001' }] }
  );
  assert.equal(groups.drafts.length, 1);
  assert.equal(groups.drafts[0].personal, false);
});

test('an audience resolver adds people we never wrote to', () => {
  const plan = planAutomation(
    fixture(),
    { ...preset('reengage-dormant'), conditions: { mutual: false } },
    {
      now: NOW,
      resolveAudience: (_links, spec) => {
        assert.deepEqual(spec, { kind: 'personal' });
        return [
          { source: 'vk', user: 'alice', personalChat: '101' },
          { source: 'vk', user: '555', name: 'Новый друг' },
        ];
      },
    }
  );
  assert.deepEqual(plan.drafts.map((d) => d.chat).sort(), ['101', '555']);
  const stranger = plan.drafts.find((d) => d.chat === '555');
  assert.equal(stranger.form, 'formal');
});

test('safe mode queues drafts and sends only after confirmation', async () => {
  const store = await seeded();
  const sent = [];
  const typing = [];
  const { state, clock } = clockAt(NOW);
  const runner = createAutomationRunner({
    store,
    clock,
    sleep: async () => {},
    send: async (draft) => {
      sent.push(draft);
      return { via: 'api' };
    },
    setTyping: async (where) => {
      typing.push(where);
    },
  });
  const automation = preset('reengage-dormant');
  await store.put(automation);
  const run = await runner.run('reengage-dormant');
  assert.equal(run.queued.length, 2);
  assert.equal(sent.length, 0);
  const pending = await runner.drafts({ automation: automation.id });
  assert.equal(pending.length, 2);

  // A second run does not duplicate pending drafts.
  const again = await runner.run('reengage-dormant');
  assert.equal(again.drafts.length, 0);
  assert.equal(
    again.excluded.filter((e) => e.reason === 'draft-pending').length,
    2
  );

  const alice = pending.find((d) => d.contact === 'alice');
  await assert.rejects(
    runner.sendDraft(alice.id),
    (error) =>
      error instanceof ConfirmationRequiredError &&
      error.code === 'confirm-required'
  );
  const switched = await runner.setDraftForm(alice.id, 'formal');
  assert.match(switched.text, /^Здравствуйте\n/);
  const outcome = await runner.sendDraft(alice.id, {
    confirm: true,
    form: 'informal',
  });
  assert.equal(outcome.status, 'sent');
  assert.equal(outcome.record.via, 'api');
  assert.match(sent[0].text, /^Привет\n/);
  assert.deepEqual(typing, [{ source: 'vk', chat: '101' }]);
  const chat = (await store.query()).filter(
    (l) => l.id.startsWith('msg:vk:101:out-') && l.sender === 'me'
  );
  assert.equal(chat.length, 1);
  assert.ok(
    (await store.query()).some((l) => l.id === 'typing:vk:101:me'),
    'our typing status is stored for the chat header'
  );

  const bob = pending.find((d) => d.contact === 'bob');
  const skipped = await runner.skip(bob.id);
  assert.equal(skipped.record.status, 'skipped');
  assert.deepEqual(await runner.drafts(), []);

  // Alice was just written to, Bob's skip is in its cooldown; 91 days later
  // both are due again (and Carol has gone quiet too).
  const cooled = await runner.plan(automation);
  assert.deepEqual(cooled.excluded.map((e) => e.reason).sort(), [
    'already-skipped',
    'not-mutual',
    'talked-recently',
    'talked-recently',
  ]);
  state.now += 91 * DAY_MS;
  const later = await runner.plan(automation);
  assert.deepEqual(later.drafts.map((d) => d.contact).sort(), [
    'alice',
    'bob',
    'carol',
  ]);
  assert.equal((await runner.history()).length, 2);
});

test('markSent records a message the user sent by hand', async () => {
  const store = await seeded();
  const runner = createAutomationRunner({ store, clock: clockAt(NOW).clock });
  const run = await runner.run(preset('reengage-dormant'), {
    targets: [{ source: 'vk', chat: '102' }],
  });
  await assert.rejects(
    runner.sendDraft(run.queued[0].id, { confirm: true }),
    /no sender configured/
  );
  const marked = await runner.markSent(run.queued[0].id);
  assert.equal(marked.record.status, 'sent');
  assert.equal(marked.record.manual, true);
});

test('auto mode needs confirm for manual runs, then paces and caps', async () => {
  const links = fixture();
  for (let i = 0; i < 5; i += 1) {
    links.push(m(`30${i}`, 'me', 'Здравствуйте', 150));
    links.push(m(`30${i}`, `p${i}`, 'Добрый день', 150));
  }
  const store = await seeded(links);
  const slept = [];
  const sent = [];
  const runner = createAutomationRunner({
    store,
    clock: clockAt(NOW).clock,
    sleep: async (ms) => {
      slept.push(ms);
    },
    random: () => 0.5,
    send: async (draft) => {
      sent.push(draft.chat);
      if (draft.chat === '300') {
        throw new Error('flood control');
      }
      return { via: 'browser' };
    },
  });
  const automation = {
    ...preset('reengage-dormant'),
    mode: 'auto',
    pacing: { minDelayMs: 1000, maxDelayMs: 3000, dailyCap: 4 },
  };
  await assert.rejects(runner.run(automation), ConfirmationRequiredError);
  const out = await runner.run(automation, { confirm: true });
  assert.equal(out.total, 7);
  assert.equal(out.results.length, 4);
  assert.equal(out.capped, 3);
  assert.equal(sent.length, 4);
  const failed = out.results.filter((r) => r.status === 'failed');
  assert.deepEqual(
    failed.map((r) => r.error),
    ['flood control']
  );
  // Typing pauses for each message plus three 2s gaps between them.
  const gaps = slept.filter((ms) => ms === 2000);
  assert.equal(gaps.length, 3);
  assert.ok(slept.some((ms) => ms > 2000 && ms <= 8000));

  // Three were sent today, so the cap leaves room for one more.
  const next = await runner.run(automation, { confirm: true });
  assert.equal(next.results.length, 1);
});

test('typing time follows 450 chars/min and is capped', () => {
  const pacing = { charsPerMinute: 450, maxTypingMs: 8000 };
  assert.equal(typingDurationMs('x'.repeat(45), pacing), 6000);
  assert.equal(typingDurationMs('x'.repeat(4500), pacing), 8000);
});

test('the scheduler runs due schedule triggers once per period', async () => {
  const store = await seeded();
  const { state, clock } = clockAt(NOW);
  const runs = [];
  const runner = {
    run: async (automation, options) => {
      runs.push([automation.id, options.trigger]);
      return { ok: true };
    },
  };
  await store.put(
    normalizeAutomation({
      id: 'weekly',
      triggers: [{ kind: 'schedule', every: '1w' }],
    })
  );
  await store.put(
    normalizeAutomation({
      id: 'off',
      enabled: false,
      triggers: [{ kind: 'schedule', every: '1d' }],
    })
  );
  const scheduler = createAutomationScheduler({ store, runner, clock });
  assert.equal((await scheduler.tick()).length, 1);
  assert.equal((await scheduler.tick()).length, 0);
  state.now += 8 * DAY_MS;
  assert.equal((await scheduler.tick()).length, 1);
  assert.deepEqual(runs, [
    ['automation:weekly', 'schedule'],
    ['automation:weekly', 'schedule'],
  ]);
});

test('incoming triggers draft a reply in the chat that matched', async () => {
  const store = await seeded();
  const { clock } = clockAt(NOW);
  const runner = createAutomationRunner({ store, clock });
  await store.put({ ...preset('greet-back'), enabled: true });
  const scheduler = createAutomationScheduler({ store, runner, clock });
  scheduler.start();
  try {
    const hello = m('103', 'carol', 'Привет, есть минутка?', 0);
    const ran = await scheduler.onMessage(hello);
    assert.equal(ran.length, 1);
    assert.equal(ran[0].trigger, 'incoming');
    assert.equal(ran[0].queued.length, 1);
    assert.equal(ran[0].queued[0].chat, '103');
    assert.match(ran[0].queued[0].text, /^Привет!/);
    assert.deepEqual(
      await scheduler.onMessage(m('103', 'me', 'Привет', 0)),
      []
    );
    assert.deepEqual(await scheduler.onMessage(m('103', 'carol', 'ок', 0)), []);
    // Messages from before the scheduler started (imports) never fire.
    assert.deepEqual(
      await scheduler.onMessage(m('101', 'alice', 'hello', 30)),
      []
    );
  } finally {
    scheduler.stop();
  }
});
