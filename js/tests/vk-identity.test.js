import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { identityQuestionForm } from '../src/crm/identity-question.js';
import { messageTime } from '../src/crm/message-time.js';
import { addressFormOf, learnAddress } from '../src/crm/person-learn.js';
import { planAutomation } from '../src/automation/automations.js';
import {
  createAutomationRunner,
  createAutomationScheduler,
  stillConfirmed,
} from '../src/automation/runner.js';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createAutomationApi } from '../src/web/automation-api.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { vkReplyApi, confirmVkReplyOnce } from './helpers/vk-reply-api.mjs';
import {
  identityMessage,
  identityPreset,
  identityServer,
  seedIdentity,
} from '../../experiments/issue-56/vk-identity-fixture.mjs';

const target = { targets: [{ source: 'vk', chat: '41' }] };
const withoutNetwork = () => {
  throw new Error('Unexpected network effect');
};

test('private reply histories order Unix seconds, milliseconds and ISO receipts consistently', async () => {
  const store = await seedIdentity();
  const old = {
    ...identityMessage(50, '41', 'Owner reply', { from_id: 1, out: 1 }),
    timestamp: '2026-11-15T00:00:00Z',
  };
  const fresh = {
    ...identityMessage(51, '41', 'Кто ты?'),
    timestamp: 1794700801,
  };
  await store.put(old);
  await store.put(fresh);
  // Use only these two records so fixture wall time cannot determine ordering.
  const plan = planAutomation([old, fresh], identityPreset(), target);
  assert.equal(plan.drafts.length, 1);
  assert.equal(plan.drafts[0].identity.message, fresh.id);
  assert.equal(addressFormOf([old, fresh]).reason, 'identity');
  assert.equal(
    messageTime(fresh.timestamp),
    messageTime('2026-11-15T00:00:01Z')
  );
  for (const invalid of [null, '', ' ', true, {}, 1e99]) {
    assert.ok(Number.isNaN(messageTime(invalid)));
  }
});

test('identity recognizes all six pinned questions and refuses extra or unbounded content', () => {
  for (const [form, questions] of Object.entries({
    informal: ['Кто ты?', 'Ты кто?', 'А ты кто ?'],
    formal: ['Кто вы?', 'Вы кто?', 'А вы кто ?'],
  })) {
    for (const body of questions) {
      assert.equal(identityQuestionForm(body), form, body);
    }
  }
  for (const body of [
    '',
    'Кто ты',
    'Кто ты? И откуда?',
    'Кто? ты?',
    'Кто вы 123?',
    'Кто вы?'.repeat(100),
  ]) {
    assert.equal(identityQuestionForm(body), null, body.slice(0, 80));
  }
});

test('identity preset is disabled and plans only the latest incoming private question', async () => {
  const store = await seedIdentity();
  const preset = identityPreset();
  assert.ok(preset, 'the shared identity preset must exist');
  assert.equal(preset.enabled, false);
  const plan = planAutomation(await store.query(), preset);
  assert.deepEqual(
    plan.drafts.map((d) => [d.chat, d.form, d.text]),
    [
      ['41', 'informal', 'Я программист, а ты?'],
      ['42', 'formal', 'Я программист, а Вы?'],
    ]
  );
  assert.equal(
    planAutomation(await store.query(), preset, {
      test: true,
      targets: ['43', '2000000001', '45'].map((chat) => ({
        source: 'vk',
        chat,
      })),
    }).drafts.length,
    0
  );
  await store.put(identityMessage(20, '41', 'Спасибо!'));
  assert.equal(
    planAutomation(await store.query(), preset, target).drafts.length,
    0
  );
});

test('identity address preference beats older usage, survives later ordinary turns and yields to a later agreement', () => {
  const messages = Array.from({ length: 10 }, (_, i) =>
    identityMessage(i + 1, '41', 'Здравствуйте, Вы можете?')
  );
  const question = identityMessage(20, '41', 'Кто ты?');
  messages.push(question, identityMessage(21, '41', 'Спасибо'));
  assert.equal(addressFormOf(messages).form, 'informal');
  assert.equal(learnAddress(messages).basis, 'identity');
  assert.deepEqual(learnAddress(messages).evidence, [question.id]);
  messages.push(
    identityMessage(22, '41', 'Может, на вы?', { from_id: 1, out: 1 }),
    identityMessage(23, '41', 'Давайте')
  );
  assert.equal(addressFormOf(messages).form, 'formal');
  assert.equal(learnAddress(messages).basis, 'agreed');
  for (const extra of [
    { out: 1 },
    { deleted: true },
    { service: true },
    { chatType: 'group' },
  ]) {
    const ignored = { ...identityMessage(30, '41', 'Кто ты?'), ...extra };
    assert.equal(learnAddress([...messages, ignored]).form, 'formal');
  }
  assert.notEqual(
    learnAddress([
      identityMessage(1, '41', 'Кто ты?'),
      identityMessage(1, '41', 'Кто вы?', { id: 2 }),
    ]).basis,
    'identity'
  );
});

test('confirmed identity replies preserve edits, receipts and latest-input refusal after typing', async () => {
  for (const change of ['none', 'body', 'new', 'owner', 'policy', 'history']) {
    const store = await seedIdentity();
    const saved = identityPreset();
    await store.put(saved);
    const sends = [];
    const runner = createAutomationRunner({
      store,
      send: async (draft) => {
        sends.push(draft);
        return { via: 'api', id: 919 };
      },
      sleep: async () => {
        if (change === 'body') {
          await store.put(identityMessage(1, '41', 'Кто вы?'));
        }
        if (change === 'new') {
          await store.put(identityMessage(30, '41', 'Стоп!'));
        }
        if (change === 'owner') {
          await store.put(
            identityMessage(30, '41', 'Отвечено', { from_id: 1, out: 1 })
          );
        }
        if (change === 'policy') {
          await store.put({
            ...saved,
            action: {
              ...saved.action,
              templates: { formal: 'Changed', informal: 'Changed' },
            },
          });
        }
        if (change === 'history') {
          await store.put({
            ...identityMessage(0, '41', 'Earlier'),
            chatType: 'group',
          });
        }
      },
    });
    const draft = (await runner.run(saved, target)).queued[0];
    await assert.rejects(runner.sendDraft(draft.id), {
      code: 'confirm-required',
    });
    assert.equal(sends.length, 0);
    const outcome = await runner.sendDraft(draft.id, {
      confirm: true,
      text: 'My reviewed identity reply',
    });
    assert.equal(outcome.status, change === 'none' ? 'sent' : 'failed', change);
    assert.equal(sends.length, change === 'none' ? 1 : 0, change);
    if (change !== 'none') {
      assert.equal(outcome.code, 'identity-stale');
    } else {
      assert.equal(sends[0].text, 'My reviewed identity reply');
      await assert.rejects(
        runner.sendDraft(draft.id, { confirm: true }),
        /no draft/i
      );
      assert.equal(sends.length, 1);
    }
  }
});

test('identity scheduler, frozen review and four-language editor use the same configured action', async () => {
  const store = await seedIdentity();
  const preset = identityPreset();
  const form = toForm(preset);
  const checked = checkForm(
    { ...form, formal: 'Formal <friend>', informal: 'Informal <friend>' },
    preset
  );
  assert.equal(checked.error, undefined);
  assert.equal(checked.automation.triggers[0].recognizer, 'identity');
  await store.put({ ...checked.automation, enabled: true });
  const runner = createAutomationRunner({
    store,
    send: withoutNetwork,
    sleep: async () => {},
  });
  const scheduler = createAutomationScheduler({ store, runner });
  await scheduler.onMessage(identityMessage(1, '41', 'Кто ты?'));
  assert.equal((await runner.drafts()).length, 1);
  const planned = await runner.plan(preset, {
    targets: [{ source: 'vk', chat: '42' }],
  });
  const changed = globalThis.structuredClone(planned.drafts);
  changed[0].identity.fingerprint += 'changed';
  assert.equal(stillConfirmed(planned.drafts, changed).length, 0);
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    for (const key of [
      'questions.kind.reply-identity',
      'gratitude.recognizer.identity',
      'chat.about.identity',
    ]) {
      assert.ok(dictionaries[locale][key], `${locale} ${key}`);
    }
  }
  scheduler.stop();
});

test('identity CLI and offline planning retain configured address variants without effects', async () => {
  const store = await seedIdentity();
  const logs = [];
  const commands = createAutomationCommands({
    openStore: async () => store,
    send: withoutNetwork,
  });
  assert.equal(
    await commands.automations({ _: ['plan', 'identity'] }, (line) =>
      logs.push(line)
    ),
    0
  );
  assert.ok(logs.join('\n').includes('Я программист, а ты?'));
  const remote = Object.fromEntries(
    ['get', 'post', 'put', 'del', 'confirmed'].map((key) => [
      key,
      async () => null,
    ])
  );
  const api = createAutomationApi({ store, remote });
  await api.saveAutomation({
    ...identityPreset(),
    action: {
      ...identityPreset().action,
      templates: { formal: 'Formal', informal: 'Informal' },
    },
  });
  assert.deepEqual(
    (await api.planAutomation({ automation: 'identity' })).drafts.map(
      (d) => d.text
    ),
    ['Informal', 'Formal']
  );
});

test('identity preference and pending evidence survive durable Lino reopen with no recovery send', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vk-identity-'));
  let store;
  try {
    const path = join(dir, 'links.lino');
    store = await createLinoTextStore(path);
    await seedIdentity(store);
    const runner = createAutomationRunner({ store });
    const draft = (await runner.run(identityPreset(), target)).queued[0];
    await store.flush();
    await store.close();
    store = await createLinoTextStore(path);
    assert.deepEqual((await store.get(draft.id)).identity, draft.identity);
    assert.equal(
      addressFormOf(
        await store.query((m) => m.id.startsWith('msg:') && m.chat === '41')
      ).form,
      'informal'
    );
    let sends = 0;
    const reopened = createAutomationRunner({
      store,
      send: async () => {
        sends++;
        return {};
      },
      sleep: async () => {},
    });
    assert.equal(sends, 0);
    assert.equal(
      (await reopened.sendDraft(draft.id, { confirm: true })).status,
      'sent'
    );
    assert.equal(sends, 1);
  } finally {
    await store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test(
  'both default Lino APIs confirm the real VK text adapter once',
  { timeout: 15000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const fixture = await identityServer();
      const call = vkReplyApi(fixture, type);
      try {
        const run = await call('/run', { automation: 'identity', ...target });
        const draft = run.body.queued[0];
        await confirmVkReplyOnce(fixture, call, draft, (params) => {
          assert.equal(params.message, draft.text);
        });
      } finally {
        await fixture.close();
      }
    }
  }
);
