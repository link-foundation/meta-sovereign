import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  createAutomationRunner,
  createAutomationScheduler,
  stillConfirmed,
} from '../src/automation/runner.js';
import {
  planAutomation,
  normalizeAutomation,
  redraftWithForm,
  withEdit,
  editAfterSend,
  editId,
} from '../src/automation/automations.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createAutomationApi } from '../src/web/automation-api.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { gratitudeMessage as message } from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import {
  acquaintancePreset,
  seedAcquaintance,
  acquaintanceServer,
} from '../../experiments/issue-56/vk-acquaintance-fixture.mjs';
import { vkReplyApi, confirmVkReplyOnce } from './helpers/vk-reply-api.mjs';

const target = { targets: [{ source: 'vk', chat: '41' }] };
const noSend = () => {
  throw Error('Unexpected provider effect');
};

test('acquaintance preset recognizes whole personal questions with an editable one-day cooldown', async () => {
  const preset = acquaintancePreset();
  assert.ok(preset, 'the shared acquaintance preset must exist');
  assert.equal(preset.enabled, false);
  assert.equal(preset.mode, 'safe');
  assert.equal(preset.conditions.cooldownDays, 1);
  const store = await seedAcquaintance();
  const plan = planAutomation(await store.query(), preset);
  assert.deepEqual(
    plan.drafts.map((d) => [d.chat, d.form]),
    [
      ['41', 'informal'],
      ['42', 'formal'],
    ]
  );
  const { isAcquaintanceQuestion } =
    await import('../src/automation/acquaintance.js');
  for (const body of [
    'Мы знакомы?',
    'Мы знакомы с тобой?',
    'мы знакомы с вами??? 👋',
    'Знакомы?',
    'знакомы с тобой?',
  ]) {
    assert.equal(isAcquaintanceQuestion(body), true, body);
  }
  for (const body of [
    '',
    'Мы знакомы',
    'А мы знакомы?',
    'Мы знакомы? Где?',
    'Мы знакомы с кем?',
    'Мы знакомы 123?',
    'Мы знакомы?'.repeat(30),
  ]) {
    assert.equal(isAcquaintanceQuestion(body), false, body.slice(0, 80));
  }
  for (const chat of ['43', '2000000001', '45']) {
    assert.equal(
      planAutomation(await store.query(), preset, {
        test: true,
        targets: [{ source: 'vk', chat }],
      }).drafts.length,
      0,
      chat
    );
  }
  for (const extra of [
    { deleted: true },
    { service: true },
    { chatType: 'group' },
    { timestamp: null },
  ]) {
    const broken = { ...message(1, '41', 'Мы знакомы?'), ...extra };
    assert.equal(planAutomation([broken], preset, target).drafts.length, 0);
  }
});

test(
  'acquaintance daily cooldown survives acknowledgement and durable restart without replay',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-acquaintance-'));
    let store;
    let at = Date.now() + 5000;
    let sends = 0;
    const runnerFor = () =>
      createAutomationRunner({
        store,
        clock: () => new Date(at),
        send: async () => {
          sends++;
          return { via: 'api', id: sends };
        },
        sleep: async () => {},
      });
    try {
      const path = join(dir, 'links.lino');
      store = await createLinoTextStore(path);
      await seedAcquaintance(store);
      const preset = acquaintancePreset();
      const first = runnerFor();
      const draft = (await first.run(preset, target)).queued[0];
      await assert.rejects(first.sendDraft(draft.id), {
        code: 'confirm-required',
      });
      assert.equal(sends, 0);
      assert.equal(
        (await first.sendDraft(draft.id, { confirm: true })).status,
        'sent'
      );
      assert.equal(sends, 1);
      at += 1000;
      await store.put({
        ...message(30, '41', 'Мы знакомы?'),
        timestamp: at / 1000,
      });
      await store.flush();
      await store.close();
      store = await createLinoTextStore(path);
      const reopened = runnerFor();
      assert.equal(sends, 1, 'reopen must not send');
      const cooling = await reopened.plan(preset, target);
      assert.equal(cooling.drafts.length, 0);
      assert.equal(cooling.excluded[0].reason, 'already-sent');
      const other = await reopened.plan(preset, {
        targets: [{ source: 'vk', chat: '42' }],
      });
      assert.equal(other.drafts.length, 1, 'cooldown is per chat');
      at += 86400000;
      const next = await reopened.run(preset, target);
      assert.equal(next.queued.length, 1);
      assert.equal(
        (await reopened.sendDraft(next.queued[0].id, { confirm: true })).status,
        'sent'
      );
      assert.equal(sends, 2);
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test('acquaintance late input, owner reply and saved-policy changes refuse before effects', async () => {
  for (const change of ['input', 'owner', 'policy', 'catalog', 'admission']) {
    const store = await seedAcquaintance();
    const preset = acquaintancePreset();
    await store.put(preset);
    let sends = 0;
    const alter = async () => {
      if (change === 'policy' || change === 'catalog') {
        await store.put({
          ...preset,
          action: {
            ...preset.action,
            ...(change === 'catalog'
              ? { alternatives: { informal: ['Changed'], formal: [] } }
              : { templates: { informal: 'Changed', formal: 'Changed' } }),
          },
        });
      } else {
        await store.put(
          message(
            50,
            '41',
            change === 'owner' ? 'Already answered' : 'Please stop',
            { ...(change === 'owner' ? { from_id: 1, out: 1 } : {}) }
          )
        );
      }
    };
    if (change === 'admission') {
      const put = store.put.bind(store);
      store.put = async (record) => {
        const result = await put(record);
        if (record.id.startsWith('outbox:') && record.status === 'sending') {
          await alter();
        }
        return result;
      };
    }
    const runner = createAutomationRunner({
      store,
      send: async () => {
        sends++;
        return {};
      },
      sleep: async () => {
        if (change !== 'admission') {
          await alter();
        }
      },
    });
    const draft = (await runner.run(preset, target)).queued[0];
    const done = await runner.sendDraft(draft.id, {
      confirm: true,
      text: 'Reviewed introduction',
    });
    assert.equal(done.status, 'failed', change);
    assert.equal(done.code, 'acquaintance-stale', change);
    assert.equal(sends, 0, change);
  }
});

test('acquaintance alternative introductions stay stable through review, form changes and owner edits', async () => {
  const store = await seedAcquaintance();
  const base = acquaintancePreset();
  const form = {
    ...toForm(base),
    alternativeInformal: 'Hello {first} <one>\n\nHello {first} <two>',
    alternativeFormal: 'Good day {first} <one>\n\nGood day {first} <two>',
  };
  const checked = checkForm(form, base);
  assert.equal(checked.error, undefined);
  const preset = checked.automation;
  assert.equal(toForm(preset).alternativeInformal, form.alternativeInformal);
  assert.equal(toForm(preset).alternativeFormal, form.alternativeFormal);
  const links = await store.query();
  const plan = () => planAutomation(links, preset, target).drafts[0];
  const draft = plan();
  assert.equal(plan().text, draft.text);
  assert.ok(draft.text.includes('<one>') || draft.text.includes('<two>'));
  const formal = redraftWithForm(preset, draft, 'formal');
  assert.ok(formal.text.startsWith('Good day'));
  assert.equal(redraftWithForm(preset, formal, 'informal').text, draft.text);
  assert.equal(
    editAfterSend(preset, null, draft, draft.text, new Date().toISOString()),
    null,
    'sending a catalog choice must not turn it into a persistent owner edit'
  );
  const edited = withEdit(preset, {
    templates: { informal: 'My own exact introduction' },
  });
  assert.equal(
    planAutomation(links, edited, target).drafts[0].text,
    'My own exact introduction'
  );
  const texts = new Set();
  for (let id = 10; id < 14; id++) {
    texts.add(
      planAutomation(
        [message(id, '41', 'Мы знакомы?')],
        {
          ...preset,
          action: { ...preset.action, form: 'informal' },
        },
        target
      ).drafts[0].text
    );
  }
  assert.equal(
    texts.size,
    2,
    'different incoming identities can choose different introductions'
  );
  for (const alternatives of [
    null,
    [],
    { informal: 'wrong' },
    { informal: Array(33).fill('x') },
    { formal: [''] },
    { formal: [{}] },
    { formal: ['x'.repeat(4097)] },
  ]) {
    assert.throws(() =>
      normalizeAutomation({ ...base, action: { ...base.action, alternatives } })
    );
  }
  await store.put(preset);
  const runner = createAutomationRunner({
    store,
    send: async () => ({ via: 'api', id: 1 }),
    sleep: async () => {},
  });
  const queued = (await runner.run(preset, target)).queued[0];
  assert.equal(
    (await runner.sendDraft(queued.id, { confirm: true })).status,
    'sent'
  );
  assert.equal(await store.get(editId(preset)), null);
});

test('acquaintance CLI, offline editor and incoming scheduler retain variants and frozen proof', async () => {
  const store = await seedAcquaintance();
  const preset = acquaintancePreset();
  const logs = [];
  const cli = createAutomationCommands({
    openStore: async () => store,
    send: noSend,
  });
  assert.equal(
    await cli.automations({ _: ['plan', 'acquaintance'] }, (line) =>
      logs.push(line)
    ),
    0
  );
  assert.ok(logs.join('\n').includes('Пока не знакомы. Я программист, а ты?'));
  const form = {
    ...toForm(preset),
    informal: 'Hello <friend>',
    formal: 'Hello <colleague>',
    cooldownDays: '2',
  };
  const checked = checkForm(form, preset);
  assert.equal(checked.error, undefined);
  assert.equal(checked.automation.conditions.cooldownDays, 2);
  const remote = Object.fromEntries(
    ['get', 'post', 'put', 'del', 'confirmed'].map((k) => [k, async () => null])
  );
  const api = createAutomationApi({ store, remote });
  await api.saveAutomation(checked.automation);
  assert.deepEqual(
    (await api.planAutomation({ automation: 'acquaintance' })).drafts.map(
      (d) => d.text
    ),
    [form.informal, form.formal]
  );
  await store.put({ ...checked.automation, enabled: true });
  const runner = createAutomationRunner({
    store,
    send: noSend,
    sleep: async () => {},
  });
  const scheduler = createAutomationScheduler({ store, runner });
  try {
    await scheduler.onMessage(message(1, '41', 'Мы знакомы?'));
    const drafts = await runner.drafts();
    assert.equal(drafts.length, 1);
    const changed = globalThis.structuredClone(drafts);
    changed[0].acquaintance.fingerprint += 'changed';
    assert.equal(stillConfirmed(drafts, changed).length, 0);
  } finally {
    scheduler.stop();
  }
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const key of [
      'automations.presets.acquaintance.name',
      'questions.kind.reply-acquaintance',
      'gratitude.recognizer.acquaintance',
    ]) {
      assert.ok(dictionaries[locale][key], `${locale} ${key}`);
    }
  }
});

test(
  'acquaintance uses both default Lino APIs and one confirmed actual VK adapter receipt',
  { timeout: 15000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const fixture = await acquaintanceServer();
      try {
        const call = vkReplyApi(fixture, type);
        const preset = acquaintancePreset();
        preset.action.alternatives = {
          informal: [
            'Adapter introduction <one>',
            'Adapter introduction <two>',
          ],
          formal: [],
        };
        assert.equal((await call('', preset, 'PUT')).status, 200);
        const run = await call('/run', {
          automation: 'acquaintance',
          ...target,
        });
        assert.equal(run.status, 200);
        const draft = run.body.queued[0];
        assert.ok(preset.action.alternatives.informal.includes(draft.text));
        await confirmVkReplyOnce(fixture, call, draft, (params) =>
          assert.equal(params.message, draft.text)
        );
      } finally {
        await fixture.close();
      }
    }
  }
);
