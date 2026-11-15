import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import {
  reengageKinds,
  vkReengageSettings,
} from '../src/automation/vk-reengage-settings.js';
import { createVkReengageApi } from '../src/web/vk-reengage-api.js';
import { createVkReengageCommands } from '../src/cli/vk-reengage-commands.js';
import { dictionaries } from '../src/web/locales/index.js';
import { LINO_TEXT, LINO_BINARY } from '../src/transport/lino.js';
import { createWirePost } from './helpers/http-wire.mjs';
import {
  reengageServer,
  reengageAdapter,
  reengageJob,
} from '../../experiments/issue-56/vk-reengage-fixture.mjs';

test(
  'both default Lino encodings freeze each ordered payload and require current origin and confirmation',
  { timeout: 15000 },
  async () => {
    const fixture = await reengageServer();
    try {
      for (const kind of reengageKinds) {
        for (const encoding of [LINO_TEXT, LINO_BINARY]) {
          const post = createWirePost(
            fixture.base,
            `/api/vk/${kind}`,
            encoding
          );
          const settings = {
            ...(await vkReengageSettings[kind].settings(fixture.store)),
            questions: 'Owner chosen question',
            ...(kind === 'music' ? { audio: 'audio-1_23' } : {}),
          };
          assert.equal(
            (await post('', settings, 'https://foreign.invalid')).status,
            403
          );
          assert.deepEqual(
            (await post('', settings)).answer.settings,
            settings
          );
          const { plan } = (await post('/plan', {})).answer;
          assert.equal(plan.items[0].steps.at(-1).text, settings.questions);
          assert.equal(
            (await post('/run', { planId: plan.planId })).status,
            400
          );
          assert.equal((await post('/run', { scheduled: true })).status, 400);
        }
      }
      assert.equal(fixture.effects.length, 0);
      // Complete actual mocked-adapter delivery through the public transport.
      const post = createWirePost(fixture.base, '/api/vk/music', LINO_BINARY);
      const { plan } = (await post('/plan', {})).answer;
      assert.equal(
        (await post('/run', { planId: plan.planId, confirm: true })).answer.last
          .status,
        'confirmed'
      );
      assert.equal(fixture.effects.length, 3);
      fixture.refuseWrites(true);
      const policy = vkReengageSettings.music;
      const before = await policy.settings(fixture.store);
      await assert.rejects(
        policy.save(fixture.store, { ...before, questions: 'Changed' })
      );
      assert.deepEqual(await policy.settings(fixture.store), before);
    } finally {
      await fixture.close();
    }
  }
);
test('offline configuration and every four-language control preserve truthful server capability', async () => {
  const store = createMemoryStore();
  const api = createVkReengageApi({
    get: async () => null,
    report: async () => null,
    local: async () => store,
  });
  for (const kind of reengageKinds) {
    const title = `Vk${kind[0].toUpperCase()}${kind.slice(1)}`;
    const settings = {
      ...(await vkReengageSettings[kind].settings(store)),
      questions: 'Owner question',
    };
    assert.deepEqual((await api[`save${title}`](settings)).settings, settings);
    assert.equal((await api[`vk${title.slice(2)}`]()).canRun, false);
    assert.equal((await api[`plan${title}`]()).ok, false);
    for (const dictionary of Object.values(dictionaries)) {
      for (const key of [
        'title',
        'hint',
        'greeting',
        'questions',
        'audio',
        'partial',
        'manualReview',
        'noHistory',
        'audioMissing',
        'delivered',
        'run',
        'cooldown',
      ]) {
        assert.ok(dictionary[`vk${title.slice(2)}.${key}`], key);
      }
    }
  }
});
test('foreground CLI saves independent strict settings, applies only explicit review and drains owned resources', async () => {
  for (const kind of reengageKinds) {
    const store = createMemoryStore();
    const adapter = reengageAdapter();
    let closed = 0;
    store.close = async () => {
      closed++;
    };
    const command = createVkReengageCommands({
      openStore: async () => store,
      openReadOnly: async () => store,
      createJob: () => reengageJob(kind, store, adapter),
    })[`vk-${kind}`];
    let answer;
    const log = (value) => {
      answer = JSON.parse(value);
    };
    assert.equal(
      await command(
        {
          _: ['save'],
          greeting: 'Owner hello',
          questions: 'Owner question',
          ...(kind === 'music' ? { audio: 'audio-1_23' } : {}),
        },
        log
      ),
      0
    );
    assert.equal(await command({ _: ['plan'] }, log), 0);
    const plan = answer.plan.planId;
    await assert.rejects(command({ _: ['run'], plan }, log), /Confirm/);
    assert.equal(adapter.effects.length, 0);
    assert.equal(await command({ _: ['run'], plan, confirm: true }, log), 0);
    assert.equal(adapter.effects.length, kind === 'music' ? 3 : 2);
    await assert.rejects(command({ _: ['save'], 'online-only': 'yes' }, log));
    assert.equal(closed, 5);
  }
});
