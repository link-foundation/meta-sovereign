import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  engagementPreset,
  seedEngagement,
  engagementServer,
} from '../../experiments/issue-56/vk-engagement-fixture.mjs';
import { gratitudeMessage as message } from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import {
  createAutomationRunner,
  createAutomationScheduler,
  stillConfirmed,
} from '../src/automation/runner.js';
import {
  planAutomation,
  redraftWithForm,
} from '../src/automation/automations.js';
import { negativeAcquaintanceReply } from '../src/automation/engagement.js';
import { orderedReplyState } from '../src/automation/ordered-reply.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createAutomationApi } from '../src/web/automation-api.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { vkReplyApi } from './helpers/vk-reply-api.mjs';
const target = { targets: [{ source: 'vk', chat: '41' }] };
const runnerFor = (store, send, extra = {}) =>
  createAutomationRunner({ store, send, sleep: async () => {}, ...extra });
const receipt = (id) => ({ via: 'api', result: id });
const queue = async (runner) =>
  (await runner.run(engagementPreset(), target)).queued[0];
const statuses = (result) => result.progress.steps.map((step) => step.status);
const noSend = () => {
  throw Error('Unexpected provider effect');
};

test('engagement preset requires the pinned adjacent question and bounded whole negative replies', async () => {
  const preset = engagementPreset();
  assert.ok(preset, 'missing ordered engagement preset');
  assert.equal(preset.enabled, false);
  assert.equal(preset.mode, 'safe');
  assert.deepEqual(preset.action.stickerIds, ['59431']);
  const store = await seedEngagement();
  const records = await store.query();
  const plan = planAutomation(records, preset);
  assert.deepEqual(
    plan.drafts.map((d) => [d.chat, d.form]),
    [
      ['41', 'informal'],
      ['42', 'formal'],
    ]
  );
  const positives = [
    'Нет',
    'Нет вроде',
    'Нет наверное',
    'Нет, наверное',
    'Нет,мы не общались.',
    'Вроде нет',
    'Вроде бы нет',
    'Думаю нет )',
    'Да вроде нет',
    'Да вроде нет переписки',
    'По-моему нет',
    'неа',
    'Не',
    'Не вроде',
    'Не помню',
    'Не думаю',
    'Не знаю',
    'Не припомню',
    'Не помню.',
    'Вряд ли',
  ];
  for (const body of positives) {
    assert.equal(negativeAcquaintanceReply(body), true, body);
  }
  for (const body of [
    '',
    'Да',
    'Нет, а вы кто?',
    'Нет, не хочу общаться',
    'Мне кажется нет',
    'x'.repeat(257),
  ]) {
    assert.equal(negativeAcquaintanceReply(body), false, body);
  }
  for (const extra of [
    { outgoing: true },
    { deleted: true },
    { service: true },
    { chatType: 'group' },
    { timestamp: null },
  ]) {
    const changed = records.map((m) =>
      m.id === 'msg:vk:3' ? { ...m, ...extra } : m
    );
    assert.equal(
      planAutomation(changed, preset, target).drafts.length,
      0,
      JSON.stringify(extra)
    );
  }
  for (const extra of [
    { body: 'Другой вопрос?' },
    { outgoing: false, out: 0, sender: '41' },
    { timestamp: records.find((m) => m.id === 'msg:vk:3').timestamp },
  ]) {
    const changed = records.map((m) =>
      m.id === 'msg:vk:2' ? { ...m, ...extra } : m
    );
    assert.equal(
      planAutomation(changed, preset, target).drafts.length,
      0,
      JSON.stringify(extra)
    );
  }
});

test('ordered replies share CLI, offline, form alternatives, scheduler and frozen step review', async () => {
  const store = await seedEngagement();
  const preset = engagementPreset();
  const checked = checkForm(
    {
      ...toForm(preset),
      alternativeInformal: 'One\n\nTwo',
      alternativeFormal: 'Formal one\n\nFormal two',
      gratitudeStickers: '59431, 59432',
    },
    preset
  );
  assert.equal(checked.error, undefined);
  await store.put(checked.automation);
  const output = [];
  const cli = createAutomationCommands({
    openStore: async () => store,
    send: noSend,
  });
  assert.equal(
    await cli.automations({ _: ['plan', 'engagement'] }, (line) =>
      output.push(line)
    ),
    0
  );
  assert.match(output.join('\n'), /1\. VK sticker 5943[12]/u);
  assert.match(output.join('\n'), /2\. (One|Two)/u);
  const remote = Object.fromEntries(
    ['get', 'post', 'put', 'del', 'confirmed'].map((key) => [
      key,
      async () => null,
    ])
  );
  const api = createAutomationApi({ store, remote });
  const planned = await api.planAutomation({ automation: 'engagement' });
  assert.equal(planned.drafts.length, 2);
  assert.deepEqual(
    (await api.planAutomation({ automation: 'engagement' })).drafts,
    planned.drafts
  );
  assert.match(
    redraftWithForm(checked.automation, planned.drafts[0], 'formal').text,
    /^Formal /u
  );
  const changed = globalThis.structuredClone(planned.drafts);
  changed[0].engagement.sticker = '1';
  assert.equal(stillConfirmed(planned.drafts, changed).length, 1);
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const key of [
      'automations.presets.engagement.name',
      'questions.kind.reply-engagement',
      'engagement.hint',
    ]) {
      assert.ok(dictionaries[locale][key], `${locale} ${key}`);
    }
  }
  await store.put({ ...checked.automation, enabled: true });
  const runner = runnerFor(store, noSend);
  const scheduler = createAutomationScheduler({ store, runner });
  try {
    await scheduler.onMessage(message(3, '41', 'Нет вроде'));
    assert.equal((await runner.drafts()).length, 1);
  } finally {
    scheduler.stop();
  }
});

for (const type of [LINO_TEXT, LINO_BINARY]) {
  test(
    `two distinct VK API receipts follow frozen confirmation through ${type}`,
    { timeout: 20000 },
    async () => {
      const fixture = await engagementServer();
      try {
        const call = vkReplyApi(fixture, type);
        const draft = (
          await call('/run', { automation: 'engagement', ...target })
        ).body.queued[0];
        const request = {
          id: draft.id,
          text: 'Reviewed introduction <literal> & 👋',
          form: draft.form,
        };
        let asked = await call('/drafts/send', request);
        assert.equal(asked.status, 428);
        assert.equal(fixture.vk.calls.length, 0);
        const stored = await fixture.store.get(draft.id);
        await fixture.store.put({
          ...stored,
          engagement: { ...stored.engagement, sticker: '1' },
        });
        const stale = await call('/drafts/send', {
          ...request,
          confirmToken: asked.body.confirm.token,
        });
        assert.equal(stale.body.code, 'draft-changed');
        assert.equal(fixture.vk.calls.length, 0);
        await fixture.store.put(stored);
        asked = await call('/drafts/send', request);
        const confirmed = {
          ...request,
          confirmToken: asked.body.confirm.token,
        };
        const done = await call('/drafts/send', confirmed);
        assert.equal(done.body.status, 'sent', JSON.stringify(done.body));
        assert.deepEqual(statuses(done.body), ['sent', 'sent']);
        assert.deepEqual(
          fixture.vk.calls.map((c) => [
            c.params.sticker_id ?? '',
            c.params.message ?? '',
          ]),
          [
            ['59431', ''],
            ['', request.text],
          ]
        );
        assert.notEqual(
          fixture.vk.calls[0].params.random_id,
          fixture.vk.calls[1].params.random_id
        );
        for (const id of [919, 920]) {
          assert.ok(await fixture.store.get(`msg:vk:${id}`));
        }
        assert.equal(
          (await fixture.store.query((l) => l.id.startsWith('outbox:'))).length,
          2
        );
        await call('/drafts/send', confirmed);
        assert.equal(fixture.vk.calls.length, 2);
      } finally {
        await fixture.close();
      }
    }
  );
}

test(
  'definite text failure resumes only the remaining step after explicit review and durable reopen',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-engagement-'));
    let store;
    const calls = [];
    let fail = true;
    const send = async (draft) => {
      calls.push(draft);
      if (!draft.sticker && fail) {
        throw Object.assign(Error('VK refused text'), {
          definitive: true,
          code: 'vk-refused',
        });
      }
      return receipt(draft.sticker ? 919 : 920);
    };
    try {
      const path = join(dir, 'links.lino');
      store = await createLinoTextStore(path);
      await seedEngagement(store);
      let runner = runnerFor(store, send);
      const draft = await queue(runner);
      const partial = await runner.sendDraft(draft.id, { confirm: true });
      assert.equal(partial.code, 'sequence-partial');
      assert.deepEqual(statuses(partial), ['sent', 'failed']);
      await store.close();
      store = await createLinoTextStore(path);
      runner = runnerFor(store, send);
      assert.equal(calls.length, 2);
      assert.deepEqual(statuses((await runner.drafts())[0]), [
        'sent',
        'failed',
      ]);
      assert.deepEqual(
        statuses(
          (await runner.run('engagement', { ...target, test: true })).queued[0]
        ),
        ['sent', 'failed']
      );
      assert.equal(
        (
          await runner.sendDraft(draft.id, {
            confirm: true,
            text: 'Changed introduction',
          })
        ).code,
        'sequence-changed'
      );
      assert.equal(calls.length, 2);
      fail = false;
      const done = await runner.sendDraft(draft.id, { confirm: true });
      assert.equal(done.status, 'sent', JSON.stringify(done));
      assert.deepEqual(statuses(done), ['sent', 'sent']);
      assert.equal(calls.length, 3);
      assert.equal(calls.filter((c) => c.sticker).length, 1);
      assert.equal(calls[1].clientId, calls[2].clientId);
      assert.equal((await runner.drafts()).length, 0);
      await store.put(message(30, '41', 'Нет'));
      assert.equal(
        (await runner.plan(engagementPreset(), target)).drafts.length,
        0
      );
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

for (const uncertainStep of [1, 2]) {
  test(`uncertain step ${uncertainStep} never replays after runner reconstruction`, async () => {
    const store = await seedEngagement();
    let calls = 0;
    const send = async () => {
      calls++;
      if (calls === uncertainStep) {
        throw Object.assign(Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
      }
      return receipt(919);
    };
    let runner = runnerFor(store, send);
    const draft = await queue(runner);
    const result = await runner.sendDraft(draft.id, { confirm: true });
    assert.equal(result.status, 'unknown');
    assert.equal(result.progress.sent, uncertainStep - 1);
    runner = runnerFor(store, send);
    assert.equal(
      (await runner.sendDraft(draft.id, { confirm: true })).code,
      'sequence-unknown'
    );
    assert.equal(calls, uncertainStep);
  });
}

test(
  'concurrent confirmation acquires the sequence before loading or sending either step',
  { timeout: 10000 },
  async () => {
    const store = await seedEngagement();
    let release;
    let started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = new Promise((resolve) => {
      started = resolve;
    });
    const calls = [];
    const runner = runnerFor(store, async (draft) => {
      calls.push(draft);
      if (draft.sticker) {
        started();
        await gate;
      }
      return receipt(918 + calls.length);
    });
    const draft = await queue(runner);
    const active = runner.sendDraft(draft.id, { confirm: true });
    await first;
    try {
      assert.equal(
        (await runner.sendDraft(draft.id, { confirm: true })).code,
        'sequence-busy'
      );
    } finally {
      release();
    }
    assert.equal((await active).status, 'sent');
    assert.equal(calls.length, 2);
  }
);

test('missing or unretained first receipt refuses the second effect', async () => {
  for (const mode of ['no-id', 'settle', 'flush']) {
    const store = await seedEngagement();
    let calls = 0;
    const put = store.put.bind(store);
    let failed = false;
    if (mode === 'settle') {
      store.put = async (link) => {
        if (link.id.startsWith('outbox:') && link.status === 'sent') {
          throw Error('finite write refusal');
        }
        return put(link);
      };
    }
    if (mode === 'flush') {
      store.flush = async () => {
        if (failed) {
          throw Error('finite flush refusal');
        }
      };
    }
    const runner = runnerFor(store, async () => {
      calls++;
      failed = true;
      return mode === 'no-id' ? { via: 'api' } : receipt(919);
    });
    const draft = await queue(runner);
    const result = await runner.sendDraft(draft.id, { confirm: true });
    assert.equal(result.code, 'sequence-receipt-missing', mode);
    assert.equal(calls, 1, mode);
    assert.ok(await store.get(draft.id));
    if (mode === 'no-id') {
      assert.equal(result.status, 'unknown');
      assert.equal(result.progress.sent, 0);
      assert.equal(result.progress.steps[0].status, 'unknown');
      assert.equal(
        (
          await store.query(
            (link) => link.automation && link.id.startsWith('msg:')
          )
        ).length,
        0
      );
      const retried = await runnerFor(store, async () => calls++).sendDraft(
        draft.id,
        { confirm: true }
      );
      assert.equal(retried.code, 'sequence-unknown');
      assert.equal(calls, 1);
    }
  }
});

test('each step rechecks adjacent context and policy before admission and provider effects', async () => {
  for (const mode of [
    'before',
    'first-admission',
    'after-first',
    'second-typing',
    'second-admission',
    'spoof-receipt',
    'policy',
  ]) {
    const store = await seedEngagement();
    let calls = 0;
    const put = store.put.bind(store);
    const alter = async () =>
      put({ ...(await store.get('msg:vk:2')), body: 'Changed question' });
    const runner = runnerFor(
      store,
      async (draft) => {
        calls++;
        if (mode === 'after-first') {
          await alter();
        }
        if (mode === 'policy') {
          const preset = engagementPreset();
          await put({
            ...preset,
            action: { ...preset.action, stickerIds: ['1'] },
          });
        }
        return receipt(draft.sticker ? 919 : 920);
      },
      {
        setTyping: async () => {
          if (mode === 'second-typing') {
            await alter();
          }
        },
      }
    );
    const draft = await queue(runner);
    if (mode === 'spoof-receipt') {
      store.put = async (link) =>
        put(
          link.id === 'msg:vk:919'
            ? { ...link, body: 'Different imported message' }
            : link
        );
    }
    if (mode === 'before') {
      await alter();
    }
    if (mode.endsWith('admission')) {
      store.put = async (link) => {
        const result = await put(link);
        if (
          link.status === 'sending' &&
          link.sequence?.index === (mode === 'first-admission' ? 1 : 2)
        ) {
          await alter();
        }
        return result;
      };
    }
    const result = await runner.sendDraft(draft.id, { confirm: true });
    assert.equal(result.status, 'failed', mode);
    assert.equal(
      calls,
      ['before', 'first-admission'].includes(mode) ? 0 : 1,
      mode
    );
  }
});

test('a canonical imported acknowledgement is skipped, while later incoming messages refuse the text', async () => {
  for (const changed of [false, true]) {
    const store = await seedEngagement();
    const put = store.put.bind(store);
    let calls = 0;
    store.put = async (link) => {
      if (link.id === 'msg:vk:919') {
        await put(
          message(919, '41', '', {
            from_id: 1,
            out: 1,
            attachments: [{ type: 'sticker', sticker: { sticker_id: 59431 } }],
          })
        );
        if (changed) {
          await put(message(920, '41', 'Стоп'));
        }
        return link;
      }
      return put(link);
    };
    const runner = runnerFor(store, async () => receipt(918 + ++calls));
    const draft = await queue(runner);
    const done = await runner.sendDraft(draft.id, { confirm: true });
    assert.equal(done.status, changed ? 'failed' : 'sent');
    assert.equal(calls, changed ? 1 : 2);
  }
});

test('automatic partial delivery requires manual review and cannot replay the acknowledged sticker', async () => {
  const store = await seedEngagement();
  let calls = 0;
  const runner = runnerFor(store, async () => {
    calls++;
    if (calls === 2) {
      throw Object.assign(Error('Refused'), { definitive: true });
    }
    return receipt(918 + calls);
  });
  const preset = { ...engagementPreset(), mode: 'auto', enabled: true };
  const approved = (await runner.plan(preset, target)).drafts;
  const first = await runner.run(preset, { ...target, confirmed: approved });
  assert.equal(first.results[0].code, 'sequence-partial');
  const [draft] = await runner.drafts();
  assert.deepEqual(statuses(draft), ['sent', 'failed']);
  await runner.run(preset, { ...target, confirmed: approved });
  assert.equal(calls, 2);
  assert.equal(
    (await runner.sendDraft(draft.id, { confirm: true })).status,
    'sent'
  );
  assert.equal(calls, 3);
});

test('an opt-out introduced after the sticker blocks the text without discarding its receipt', async () => {
  const store = await seedEngagement();
  let calls = 0;
  const runner = runnerFor(store, async () => {
    calls++;
    await store.put({
      id: 'automation-settings:global',
      optOut: [{ source: 'vk', chat: '41' }],
    });
    return receipt(919);
  });
  const draft = await queue(runner);
  const result = await runner.sendDraft(draft.id, { confirm: true });
  assert.equal(result.code, 'sequence-partial');
  assert.equal(result.stepCode, 'opted-out');
  assert.equal(calls, 1);
  assert.equal(
    (await orderedReplyState(store, draft)).records[0].vkReceipt.id,
    'msg:vk:919'
  );
});
