import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { createLinoTextStore } from '../src/storage/lino-store.js';
import {
  gratitudeMessage,
  gratitudePreset,
  gratitudeServer,
  seedGratitude,
} from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import {
  gratitudeStickerIds,
  isGratitudeMessage,
} from '../src/automation/gratitude.js';
import {
  incomingTrigger,
  normalizeAutomation,
  planAutomation,
} from '../src/automation/automations.js';
import {
  createAutomationRunner,
  createAutomationScheduler,
  stillConfirmed,
} from '../src/automation/runner.js';
import { createDefaultSender } from '../src/sources/browser-sender.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createAutomationApi } from '../src/web/automation-api.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import { GratitudeSticker } from '../src/web/gratitude-fields.js';
import { dictionaries } from '../src/web/locales/index.js';
import { renderInLocale } from './util-render.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { vkReplyApi, confirmVkReplyOnce } from './helpers/vk-reply-api.mjs';

test('gratitude recognizes every pinned contextual phrase and all 38 stickers with finite bounds', async () => {
  const cases = JSON.parse(
    await readFile(
      new URL(
        '../../experiments/issue-56/vk-gratitude-reference-cases.json',
        import.meta.url
      )
    )
  );
  assert.ok(cases.length > 80);
  for (const body of cases) {
    assert.equal(isGratitudeMessage({ body }), true, body);
  }
  assert.equal(gratitudeStickerIds.length, 38);
  for (const id of gratitudeStickerIds) {
    assert.equal(isGratitudeMessage({ sticker: { id } }), true, id);
  }
  for (const body of [
    '',
    'привет',
    'спасибо, но нет',
    'Спасибо, когда будет готово?',
    'No thanks',
    'спасибо'.repeat(200),
    'спасибо 123',
  ]) {
    assert.equal(isGratitudeMessage({ body }), false, body.slice(0, 50));
  }
});

test('gratitude preset plans only latest incoming private VK gratitude, including manual condition bypass', async () => {
  const store = await seedGratitude();
  const preset = gratitudePreset();
  assert.ok(preset, 'the shared gratitude preset must exist');
  assert.equal(preset.enabled, false);
  const planned = planAutomation(await store.query(), preset);
  assert.deepEqual(planned.drafts.map((d) => d.chat).sort(), ['41', '42']);
  assert.ok(
    planned.drafts.every(
      (d) =>
        ['60075', '89452'].includes(d.sticker.id) &&
        d.text === '' &&
        d.gratitude
    )
  );
  assert.deepEqual(
    planAutomation(await store.query(), preset).drafts,
    planned.drafts
  );
  const bypass = planAutomation(await store.query(), preset, {
    test: true,
    targets: ['43', '2000000001', '45'].map((chat) => ({ source: 'vk', chat })),
  });
  assert.equal(bypass.drafts.length, 0);
  const owner = gratitudeMessage(10, '41', 'Отвечено', { out: 1, from_id: 1 });
  await store.put(owner);
  assert.equal(
    planAutomation(await store.query(), preset).drafts.some(
      (d) => d.chat === '41'
    ),
    false
  );
});

test('safe gratitude confirmation sends the visible sticker once and records it accurately', async () => {
  const store = await seedGratitude();
  const sent = [];
  const runner = createAutomationRunner({
    store,
    send: async (draft) => {
      sent.push(draft);
      return { via: 'api', id: 919 };
    },
    sleep: async () => {},
  });
  const run = await runner.run(gratitudePreset(), {
    targets: [{ source: 'vk', chat: '41' }],
  });
  const draft = run.queued[0];
  assert.equal(sent.length, 0);
  await assert.rejects(runner.sendDraft(draft.id), {
    code: 'confirm-required',
  });
  const outcome = await runner.sendDraft(draft.id, {
    confirm: true,
    text: '',
    form: draft.form,
  });
  assert.equal(outcome.status, 'sent');
  assert.equal(sent[0].sticker.id, draft.sticker.id);
  assert.deepEqual(outcome.record.sticker, draft.sticker);
  const history = await store.query(
    (m) => m.automation === draft.automation && m.id.startsWith('msg:')
  );
  assert.equal(history.length, 1);
  assert.deepEqual(history[0].sticker, draft.sticker);
  assert.equal(history[0].body, '');
  assert.equal(
    (await runner.plan(gratitudePreset())).drafts.some((d) => d.chat === '41'),
    false
  );
  assert.equal(sent.length, 1);
});

test('new or edited incoming messages invalidate queued gratitude without any send', async () => {
  for (const change of ['edited', 'new', 'owner', 'deleted', 'group']) {
    const store = await seedGratitude();
    let sent = 0;
    const runner = createAutomationRunner({
      store,
      send: async () => {
        sent++;
      },
      sleep: async () => {},
    });
    const draft = (
      await runner.run(gratitudePreset(), {
        targets: [{ source: 'vk', chat: '41' }],
      })
    ).queued[0];
    const message = await store.get(draft.gratitude.message);
    if (change === 'edited') {
      await store.put({ ...message, body: 'Спасибо, а где документы?' });
    }
    if (change === 'new') {
      await store.put(gratitudeMessage(20, '41', 'Благодарю!'));
    }
    if (change === 'owner') {
      await store.put(
        gratitudeMessage(20, '41', 'Уже ответил', { out: 1, from_id: 1 })
      );
    }
    if (change === 'deleted') {
      await store.put({ ...message, deleted: true });
    }
    if (change === 'group') {
      await store.put({ ...message, chatType: 'group' });
    }
    const outcome = await runner.sendDraft(draft.id, { confirm: true });
    assert.equal(outcome.code, 'gratitude-stale', change);
    assert.equal(sent, 0, change);
    assert.ok(await store.get(draft.id));
  }
});

test('explicit text and address edits choose text; a late incoming change after typing refuses', async () => {
  const store = await seedGratitude();
  const sent = [];
  const runner = createAutomationRunner({
    store,
    send: async (d) => {
      sent.push(d);
      return {};
    },
    sleep: async () => {},
  });
  const draft = (
    await runner.run(gratitudePreset(), {
      targets: [{ source: 'vk', chat: '41' }],
    })
  ).queued[0];
  assert.equal(
    (
      await runner.sendDraft(draft.id, {
        confirm: true,
        text: 'Happy to help <friend>!',
      })
    ).status,
    'sent'
  );
  assert.equal(sent[0].sticker, undefined);
  assert.equal(sent[0].text, 'Happy to help <friend>!');
  const nextStore = await seedGratitude();
  let lateSends = 0;
  const late = createAutomationRunner({
    store: nextStore,
    send: async () => {
      lateSends++;
    },
    setTyping: async () => {
      await nextStore.put(gratitudeMessage(20, '41', 'Новый вопрос?'));
    },
    sleep: async () => {},
  });
  const fresh = (
    await late.run(gratitudePreset(), {
      targets: [{ source: 'vk', chat: '41' }],
    })
  ).queued[0];
  const outcome = await late.sendDraft(fresh.id, {
    confirm: true,
    form: fresh.form === 'formal' ? 'informal' : 'formal',
  });
  assert.equal(outcome.code, 'gratitude-stale');
  assert.equal(lateSends, 0);
});

test('auto confirmation includes exact sticker and incoming evidence', async () => {
  const plan = planAutomation(
    await (await seedGratitude()).query(),
    gratitudePreset()
  );
  const draft = plan.drafts[0];
  assert.equal(
    stillConfirmed([draft], [{ ...draft, sticker: { id: '42' } }]).length,
    0
  );
  assert.equal(
    stillConfirmed(
      [draft],
      [{ ...draft, gratitude: { ...draft.gratitude, message: 'changed' } }]
    ).length,
    0
  );
  assert.equal(stillConfirmed([draft], [draft]).length, 1);
});

test('gratitude refuses a late saved policy change and newly discovered group history', async () => {
  for (const change of ['policy', 'history']) {
    const store = await seedGratitude();
    const preset = gratitudePreset();
    if (change === 'history') {
      await store.put(gratitudeMessage(0, '41', 'Earlier message'));
    }
    let sends = 0;
    const runner = createAutomationRunner({
      store,
      send: async () => {
        sends++;
      },
      setTyping: async () => {
        if (change === 'policy') {
          await store.put({
            ...preset,
            action: { ...preset.action, stickerIds: ['42'] },
          });
        } else {
          const prior = gratitudeMessage(0, '41', 'Earlier message');
          await store.put({ ...prior, chatType: 'group' });
        }
      },
      sleep: async () => {},
    });
    const draft = (
      await runner.run(preset, {
        targets: [{ source: 'vk', chat: '41' }],
      })
    ).queued[0];
    const outcome = await runner.sendDraft(draft.id, {
      confirm: true,
      text: 'Happy to help!',
    });
    assert.equal(outcome.code, 'gratitude-stale', change);
    assert.equal(sends, 0, change);
  }
});

test('incoming scheduler recognizes gratitude stickers and skips normalized outgoing records', async () => {
  const store = await seedGratitude();
  const preset = { ...gratitudePreset(), enabled: true };
  await store.put(preset);
  const events = [];
  const scheduler = createAutomationScheduler({
    store,
    runner: {
      run: async (...args) => {
        events.push(args);
        return {};
      },
    },
    clock: () => new Date(0),
  });
  const sticker = gratitudeMessage(10, '41', '', {
    attachments: [{ type: 'sticker', sticker: { sticker_id: 65091 } }],
  });
  assert.ok(incomingTrigger(preset, sticker.body, sticker));
  await scheduler.onMessage({ ...sticker, outgoing: true });
  assert.equal(events.length, 0);
  await scheduler.onMessage(sticker);
  assert.equal(events.length, 1);
  assert.equal(events[0][1].trigger, 'incoming');
});

test('VK sticker refusal never silently falls back to a text browser send', async () => {
  let browserSends = 0;
  const sender = createDefaultSender({
    getSource: () => ({
      live: {
        post: async () => {
          throw Object.assign(new Error('No access'), { code: 'no-token' });
        },
      },
    }),
    browser: {
      close: async () => {},
      send: async () => {
        browserSends++;
      },
    },
  });
  try {
    await assert.rejects(
      sender({ source: 'vk', chat: '41', text: '', sticker: { id: '60075' } }),
      (error) =>
        error.code === 'send-failed' &&
        error.errors.some((item) => item.code === 'unsupported-send-options')
    );
    assert.equal(browserSends, 0);
  } finally {
    await sender.close();
  }
});

test('shared editor preserves gratitude options and all locale sticker previews', () => {
  const preset = gratitudePreset();
  const form = toForm(preset);
  form.gratitudeStickers = '60075, 89452, 60075';
  const checked = checkForm(form, preset);
  assert.equal(checked.error, undefined);
  assert.deepEqual(checked.automation.action.stickerIds, ['60075', '89452']);
  assert.deepEqual(checked.automation.triggers, preset.triggers);
  for (const locale of ['en', 'ru', 'hi', 'zh']) {
    assert.ok(dictionaries[locale]['questions.kind.reply-gratitude']);
    const html = renderInLocale(
      locale,
      React.createElement(GratitudeSticker, {
        draft: { sticker: { id: '60075' }, text: '' },
      })
    );
    assert.ok(html.includes('data-gratitude-sticker="60075"'));
    assert.ok(
      html.includes(
        dictionaries[locale]['gratitude.preview'].replace('{id}', '60075')
      )
    );
  }
  assert.throws(
    () =>
      normalizeAutomation({
        ...preset,
        action: { ...preset.action, stickerIds: ['invalid'] },
      }),
    /stickerIds/
  );
});

test('CLI and offline APIs share configured gratitude plans without sending', async () => {
  const store = await seedGratitude();
  const commands = createAutomationCommands({
    openStore: async () => store,
    send: async () => {
      throw new Error('Unexpected send');
    },
  });
  const logs = [];
  assert.equal(
    await commands.automations({ _: ['plan', 'gratitude'] }, (line) =>
      logs.push(line)
    ),
    0
  );
  assert.ok(logs.join('\n').includes('VK sticker'));
  const remote = Object.fromEntries(
    ['get', 'post', 'put', 'del', 'confirmed'].map((key) => [
      key,
      async () => null,
    ])
  );
  const api = createAutomationApi({ store, remote });
  await api.saveAutomation({
    ...gratitudePreset(),
    action: {
      ...gratitudePreset().action,
      preferSticker: false,
      templates: { formal: 'Always welcome!', informal: 'Anytime!' },
    },
  });
  const planned = await api.planAutomation({ automation: 'gratitude' });
  assert.equal(planned.drafts.length, 2);
  assert.ok(
    planned.drafts.every((d) => d.text === 'Always welcome!' && !d.sticker)
  );
});

test('queued gratitude evidence and selected sticker survive durable Lino reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vk-gratitude-'));
  let store;
  try {
    store = await createLinoTextStore(join(dir, 'links.lino'));
    await seedGratitude(store);
    const runner = createAutomationRunner({ store });
    const draft = (
      await runner.run(gratitudePreset(), {
        targets: [{ source: 'vk', chat: '41' }],
      })
    ).queued[0];
    await store.flush();
    await store.close();
    store = await createLinoTextStore(join(dir, 'links.lino'));
    assert.deepEqual((await store.get(draft.id)).sticker, draft.sticker);
    let sends = 0;
    const reopened = createAutomationRunner({
      store,
      send: async () => {
        sends++;
        return {};
      },
      sleep: async () => {},
    });
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
  'default Lino API confirms the actual VK sticker adapter once',
  { timeout: 15000 },
  async () => {
    for (const type of [LINO_TEXT, LINO_BINARY]) {
      const fixture = await gratitudeServer();
      const call = vkReplyApi(fixture, type);
      try {
        const saved = await call('', { automation: gratitudePreset() }, 'PUT');
        assert.equal(saved.status, 200);
        const run = await call('/run', {
          automation: 'gratitude',
          targets: [{ source: 'vk', chat: '41' }],
        });
        const draft = run.body.queued[0];
        await confirmVkReplyOnce(fixture, call, draft, (params) => {
          assert.equal(String(params.sticker_id), draft.sticker.id);
        });
      } finally {
        await fixture.close();
      }
    }
  }
);
