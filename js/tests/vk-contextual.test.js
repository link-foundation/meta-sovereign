import { refuseMutatedVkReply } from './helpers/vk-reply-mutation.mjs';
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
  redraftWithForm,
} from '../src/automation/automations.js';
import {
  contextualReplyKinds,
  recognizesContextualReply,
} from '../src/automation/contextual-replies.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { createAutomationApi } from '../src/web/automation-api.js';
import { toForm, checkForm } from '../src/web/automations-model.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { gratitudeMessage as message } from '../../experiments/issue-56/vk-gratitude-fixture.mjs';
import {
  contextualPreset,
  contextualBody,
  seedContextual,
  contextualServer,
} from '../../experiments/issue-56/vk-contextual-fixture.mjs';
import { confirmVkTextReply } from './helpers/vk-reply-api.mjs';
const target = { targets: [{ source: 'vk', chat: '41' }] };
const noSend = () => {
  throw Error('Unexpected provider effect');
};

for (const kind of contextualReplyKinds) {
  test(`contextual presets expose ${kind} through safe personal planning`, async () => {
    const preset = contextualPreset(kind);
    assert.ok(preset, `missing contextual preset ${kind}`);
    assert.equal(preset.enabled, false);
    assert.equal(preset.mode, 'safe');
    const store = await seedContextual(kind);
    const plan = planAutomation(await store.query(), preset);
    assert.deepEqual(
      plan.drafts.map((d) => [d.chat, d.form]),
      [
        ['41', 'informal'],
        ['42', 'formal'],
      ]
    );
    assert.ok(
      plan.drafts.every((d) => d[kind]?.fingerprint && d[kind]?.policy)
    );
    for (const chat of ['43', '45', '2000000001']) {
      assert.equal(
        planAutomation(await store.query(), preset, {
          test: true,
          targets: [{ source: 'vk', chat }],
        }).drafts.length,
        0
      );
    }
    for (const extra of [
      { outgoing: true },
      { deleted: true },
      { service: true },
      { chatType: 'group' },
      { timestamp: null },
    ]) {
      const records = (await store.query()).map((m) =>
        m.chat === '41' && m.body === contextualBody[kind]
          ? { ...m, ...extra }
          : m
      );
      assert.equal(
        planAutomation(records, preset, target).drafts.length,
        0,
        JSON.stringify(extra)
      );
    }
    for (const locale of ['en', 'ru', 'hi', 'zh']) {
      for (const key of [
        `automations.presets.${kind}.name`,
        `questions.kind.reply-${kind}`,
        `gratitude.recognizer.${kind}`,
      ]) {
        assert.ok(dictionaries[locale][key], `${locale} ${key}`);
      }
    }
  });
}

test('contextual recognition covers every pinned well-being, purpose and bare-question example with finite negatives', () => {
  const positives = {
    wellbeing: [
      'Как дела?',
      'Как жизнь?',
      'Как поживаешь?',
      'Как дела',
      'Привет как дела😏😏',
      'How are you',
      'How are you?',
    ],
    purpose: ['Вы что-то хотели?', 'Ты что-то хотел?'],
    clarification: ['?', '??', 'м?', 'мм?', '⁉️❔⁉️', '⁉️', '❔'],
  };
  for (const [kind, examples] of Object.entries(positives)) {
    for (const body of examples) {
      assert.equal(
        recognizesContextualReply(kind, { body }),
        true,
        `${kind} ${body}`
      );
    }
    for (const body of [
      '',
      'м',
      'Чем занимаешься?',
      'Какая цель добавления в друзья?',
      'Как дела? Где вы?',
      'x'.repeat(257),
    ]) {
      assert.equal(
        recognizesContextualReply(kind, { body }),
        false,
        `${kind} ${body.slice(0, 60)}`
      );
    }
  }
});

test('first exchange and bare questions require the actual adjacent outgoing turn without ambiguous ordering', async () => {
  for (const kind of ['first-exchange', 'clarification']) {
    const store = await seedContextual(kind);
    const records = (await store.query()).filter((m) => m.chat === '41');
    const preset = contextualPreset(kind);
    for (const pair of [
      records.slice(1),
      records.map((m, i) =>
        i === 0 ? { ...m, outgoing: false, out: 0, sender: 'contact' } : m
      ),
      records.map((m, i) =>
        i === 0 ? { ...m, timestamp: records[1].timestamp } : m
      ),
      records.map((m, i) => (i === 0 ? { ...m, deleted: true } : m)),
    ]) {
      assert.equal(planAutomation(pair, preset, target).drafts.length, 0);
    }
    const extended = [message(0, '41', 'Older incoming'), ...records];
    assert.equal(
      planAutomation(extended, preset, target).drafts.length,
      kind === 'first-exchange' ? 0 : 1
    );
    const interrupted = [
      ...records,
      message(1.5, '41', 'Intervening incoming'),
    ];
    assert.equal(planAutomation(interrupted, preset, target).drafts.length, 0);
    if (kind === 'first-exchange') {
      const stickers = records.map((m) => ({
        ...m,
        body: '',
        sticker: { id: '53610' },
      }));
      assert.equal(planAutomation(stickers, preset, target).drafts.length, 1);
    }
  }
});

test('contextual drafts refuse previous-turn mutation, newly loaded older history, latest/policy changes and post-admission changes', async () => {
  for (const [kind, change] of [
    ['first-exchange', 'before'],
    ['clarification', 'before'],
    ['first-exchange', 'previous'],
    ['first-exchange', 'older'],
    ['clarification', 'previous'],
    ['clarification', 'admission'],
    ['wellbeing', 'latest'],
    ['purpose', 'policy'],
  ]) {
    const store = await seedContextual(kind);
    const preset = contextualPreset(kind);
    await store.put(preset);
    const alter = async () => {
      if (change === 'policy') {
        await store.put({
          ...preset,
          action: {
            ...preset.action,
            templates: { formal: 'Changed', informal: 'Changed' },
          },
        });
      } else if (change === 'older') {
        await store.put(message(0, '41', 'Earlier record'));
      } else if (
        change === 'before' ||
        change === 'previous' ||
        change === 'admission'
      ) {
        const prior = await store.get('msg:vk:1');
        assert.ok(prior, 'fixture previous identity');
        await store.put({ ...prior, body: 'Changed outgoing text' });
      } else {
        await store.put(message(20, '41', 'New incoming'));
      }
    };
    await refuseMutatedVkReply({ store, preset, target, alter, change });
  }
});

test('contextual CLI, offline editor, address override, incoming scheduler and frozen context share the catalog', async () => {
  for (const kind of contextualReplyKinds) {
    const store = await seedContextual(kind);
    const preset = contextualPreset(kind);
    const form = {
      ...toForm(preset),
      alternativeInformal: 'Custom informal <one>\n\nCustom informal <two>',
      alternativeFormal: 'Custom formal <one>\n\nCustom formal <two>',
    };
    const checked = checkForm(form, preset);
    assert.equal(checked.error, undefined);
    await store.put(checked.automation);
    const cli = createAutomationCommands({
      openStore: async () => store,
      send: noSend,
    });
    const output = [];
    assert.equal(
      await cli.automations({ _: ['plan', kind] }, (line) => output.push(line)),
      0
    );
    assert.ok(output.join('\n').includes('Custom informal'));
    const remote = Object.fromEntries(
      ['get', 'post', 'put', 'del', 'confirmed'].map((key) => [
        key,
        async () => null,
      ])
    );
    const api = createAutomationApi({ store, remote });
    const planned = await api.planAutomation({ automation: kind });
    assert.equal(planned.drafts.length, 2);
    assert.deepEqual(
      (await api.planAutomation({ automation: kind })).drafts.map(
        (d) => d.text
      ),
      planned.drafts.map((d) => d.text)
    );
    assert.ok(
      redraftWithForm(
        checked.automation,
        planned.drafts[0],
        'formal'
      ).text.startsWith('Custom formal')
    );
    const changed = globalThis.structuredClone(planned.drafts);
    changed[0][kind].context = ['changed'];
    assert.equal(stillConfirmed(planned.drafts, changed).length, 1);
    await store.put({ ...checked.automation, enabled: true });
    const runner = createAutomationRunner({
      store,
      send: noSend,
      sleep: async () => {},
    });
    const scheduler = createAutomationScheduler({ store, runner });
    try {
      await scheduler.onMessage(message(2, '41', contextualBody[kind]));
      assert.equal((await runner.drafts()).length, 1);
    } finally {
      scheduler.stop();
    }
  }
});

test(
  'context proof and one-day cooldown survive durable Lino reopen without recovery effects',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vk-contextual-'));
    let store;
    let sends = 0;
    const options = () => ({
      store,
      send: async () => {
        sends++;
        return { via: 'api', id: 1 };
      },
      sleep: async () => {},
    });
    try {
      const path = join(dir, 'links.lino');
      store = await createLinoTextStore(path);
      await seedContextual('clarification', store);
      const preset = contextualPreset('clarification');
      const draft = (
        await createAutomationRunner(options()).run(preset, target)
      ).queued[0];
      await store.flush();
      await store.close();
      store = await createLinoTextStore(path);
      const runner = createAutomationRunner(options());
      assert.equal(sends, 0);
      assert.deepEqual(
        (await runner.drafts())[0].clarification,
        draft.clarification
      );
      assert.equal(
        (await runner.sendDraft(draft.id, { confirm: true })).status,
        'sent'
      );
      assert.equal(sends, 1);
      await store.put(message(30, '41', '??'));
      assert.equal((await runner.plan(preset, target)).drafts.length, 0);
    } finally {
      await store?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
);

test(
  'all contextual actions confirm the actual VK adapter through both default Lino encodings',
  { timeout: 60000 },
  async () => {
    for (const kind of contextualReplyKinds) {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const fixture = await contextualServer(kind);
        try {
          await confirmVkTextReply(fixture, type, kind, target);
        } finally {
          await fixture.close();
        }
      }
    }
  }
);
