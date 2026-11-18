import {
  withdrawConsent,
  assertConsentRefusal,
  refuseConsentReads,
} from '../../experiments/issue-56/consent-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { withBrowserSendConsent } from '../../experiments/issue-56/consent-browser-send-fixture.mjs';
import { saveSettings } from '../src/automation/safety.js';

for (const source of ['vk', 'telegram', 'whatsapp']) {
  const stages =
    source === 'whatsapp'
      ? ['open', 'focus', 'button']
      : ['open', 'focus', 'type', 'fill', 'button'];
  for (const stage of stages) {
    for (const scope of ['chat', 'contact']) {
      test(
        `${source} refuses ${scope} withdrawn during browser ${stage}`,
        { timeout: 5000 },
        async () =>
          withBrowserSendConsent(source, stage, async (fixture) => {
            const { store, draft, release, pending, effects, typed } = fixture;
            await withdrawConsent(store, draft, scope);
            release.resolve();
            assertConsentRefusal(await pending);
            assert.deepEqual(effects, []);
            if (stage === 'open' || stage === 'focus') {
              assert.deepEqual(typed, []);
            }
          })
      );
    }
  }
  test(
    `${source} keeps a completed browser effect after later opt-out`,
    { timeout: 5000 },
    async () =>
      withBrowserSendConsent(source, 'issued', async (fixture) => {
        const { store, draft, release, pending, effects } = fixture;
        await withdrawConsent(store, draft);
        release.resolve();
        const { error, result } = await pending;
        assert.equal(error, undefined);
        assert.equal(result.via, 'browser');
        assert.equal(effects.length, 1);
      })
  );
}

test(
  'browser consent keeps provider, chat and person scopes separate',
  { timeout: 5000 },
  async () =>
    withBrowserSendConsent('telegram', 'button', async (fixture) => {
      const { store, release, pending, effects } = fixture;
      await saveSettings(store, {
        optOut: [
          { source: 'vk', chat: '201' },
          { source: 'telegram', chat: 'person-201' },
          { source: 'telegram', contact: '201' },
        ],
      });
      release.resolve();
      assert.equal((await pending).result.via, 'browser');
      assert.equal(effects.length, 1);
    })
);

test(
  'a queued browser send rechecks consent after the first session wait',
  { timeout: 5000 },
  async () =>
    withBrowserSendConsent('telegram', 'open', async (fixture) => {
      const { sender, store, draft, release, pending, effects, typed } =
        fixture;
      const queued = sender.send(draft).then(
        (result) => ({ result }),
        (error) => ({ error })
      );
      await saveSettings(store, {
        optOut: [{ source: draft.source, chat: draft.chat }],
      });
      release.resolve();
      const outcomes = await Promise.all([pending, queued]);
      for (const outcome of outcomes) {
        assert.equal(outcome.result, undefined);
        assert.equal(outcome.error?.code, 'opted-out');
        assert.equal(outcome.error.fallback, false);
      }
      assert.deepEqual(effects, []);
      assert.deepEqual(typed, []);
    })
);

test(
  'an already-issued browser failure retains delivery uncertainty',
  { timeout: 5000 },
  async () =>
    withBrowserSendConsent('vk', 'issued', async (fixture) => {
      const { store, draft, release, pending, effects } = fixture;
      await saveSettings(store, {
        optOut: [{ source: draft.source, contact: draft.to }],
      });
      release.reject(new Error('native click lost its receipt'));
      const { error, result } = await pending;
      assert.equal(result, undefined);
      assert.equal(error?.ambiguous, true);
      assert.equal(error.fallback, false);
      assert.equal(effects.length, 1);
    })
);

test(
  'unreadable consent after native button lookup refuses before dispatch',
  { timeout: 5000 },
  async () =>
    withBrowserSendConsent('vk', 'button', async (fixture) => {
      const { store, release, pending, effects } = fixture;
      refuseConsentReads(store, 'unavailable password=fixture-private-value');
      release.resolve();
      const outcome = await pending;
      assertConsentRefusal(outcome, 'safety-settings-unavailable');
      const { error } = outcome;
      assert.ok(!error.message.includes('fixture-private-value'));
      assert.deepEqual(effects, []);
    })
);
