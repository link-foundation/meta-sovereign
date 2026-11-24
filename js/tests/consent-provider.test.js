import test from 'node:test';
import assert from 'node:assert/strict';
import { withProviderConsent } from '../../experiments/issue-56/consent-provider-fixture.mjs';
import { consentSources } from '../../experiments/issue-56/consent-admission-fixture.mjs';
import { SETTINGS_ID, saveSettings } from '../src/automation/safety.js';
import { guardedSend, recoverOutbox } from '../src/automation/outbox.js';

for (const source of consentSources) {
  for (const scope of ['chat', 'contact']) {
    test(
      `${source} refuses ${scope} consent withdrawn during connection resolution`,
      { timeout: 5000 },
      async () =>
        withProviderConsent(source, 'options', async (fixture) => {
          const { store, draft, release, pending, effects, send } = fixture;
          await saveSettings(store, {
            optOut: [{ source, [scope]: draft[scope] }],
          });
          release.resolve();
          const result = await pending;
          assert.equal(result.status, 'failed');
          assert.equal(result.code, 'opted-out');
          assert.equal(result.outbox.status, 'failed');
          assert.deepEqual(effects, []);
          assert.equal(await recoverOutbox(store), 0);
          await saveSettings(store, { optOut: [] });
          assert.equal(
            (await guardedSend({ store, draft, send })).status,
            'sent'
          );
          assert.equal(effects.length, 1);
          assert.equal(effects[0].via, 'api');
          assert.equal(effects[0].options.connection, 'fixture');
        })
    );
  }
}

for (const source of ['vk', 'telegram', 'whatsapp']) {
  test(
    `${source} preserves a late refusal instead of entering browser fallback`,
    { timeout: 5000 },
    async () =>
      withProviderConsent(source, 'fallback', async (fixture) => {
        const { store, draft, release, pending, effects } = fixture;
        await saveSettings(store, {
          optOut: [{ source, contact: draft.contact }],
        });
        release.resolve();
        const result = await pending;
        assert.equal(result.status, 'failed');
        assert.equal(result.code, 'opted-out');
        assert.equal(result.outbox.code, 'opted-out');
        assert.deepEqual(effects, []);
      })
  );
}

test(
  'credential resolution preserves provider and chat/person consent isolation',
  { timeout: 5000 },
  async () =>
    withProviderConsent('telegram', 'options', async (fixture) => {
      const { store, release, pending, effects } = fixture;
      await saveSettings(store, {
        optOut: [
          { source: 'vk', chat: '201' },
          { source: 'telegram', chat: 'person-201' },
          { source: 'telegram', contact: '201' },
        ],
      });
      release.resolve();
      assert.equal((await pending).status, 'sent');
      assert.equal(effects.length, 1);
      assert.equal(effects[0].via, 'api');
    })
);

test(
  'unreadable current consent after credential resolution refuses both transports',
  { timeout: 5000 },
  async () =>
    withProviderConsent('email', 'options', async (fixture) => {
      const { store, release, pending, effects } = fixture;
      const get = store.get.bind(store);
      store.get = (id) => {
        if (id === SETTINGS_ID) {
          throw new Error('record unavailable password=fixture-private-value');
        }
        return get(id);
      };
      release.resolve();
      const result = await pending;
      assert.equal(result.status, 'failed');
      assert.equal(result.code, 'safety-settings-unavailable');
      assert.ok(result.error.includes('<redacted>'));
      assert.ok(!result.error.includes('fixture-private-value'));
      assert.deepEqual(effects, []);
    })
);

test(
  'a definitely refused API still permits an eligible explicit browser send',
  { timeout: 5000 },
  async () =>
    withProviderConsent('telegram', 'fallback', async (fixture) => {
      const { release, pending, effects } = fixture;
      release.resolve();
      const result = await pending;
      assert.equal(result.status, 'sent');
      assert.equal(result.result.via, 'browser');
      assert.equal(effects.length, 1);
      assert.equal(effects[0].via, 'browser');
    })
);

test(
  'a positive API receipt survives consent withdrawn after the provider effect',
  { timeout: 5000 },
  async () =>
    withProviderConsent('telegram', 'receipt', async (fixture) => {
      const { store, draft, release, pending, effects } = fixture;
      assert.equal(effects.length, 1);
      await saveSettings(store, {
        optOut: [{ source: draft.source, contact: draft.contact }],
      });
      release.resolve();
      const result = await pending;
      assert.equal(result.status, 'sent');
      assert.equal(result.outbox.status, 'sent');
      assert.equal(result.result.messageId, '301');
      assert.equal(effects.length, 1);
    })
);
