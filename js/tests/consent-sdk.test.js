import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSettings } from '../src/automation/safety.js';
import {
  sdkVariants,
  withSdkConsent,
} from '../../experiments/issue-56/consent-sdk-fixture.mjs';
import {
  withdrawConsent,
  assertConsentRefusal,
  refuseConsentReads,
} from '../../experiments/issue-56/consent-fixture.mjs';

for (const variant of sdkVariants) {
  test(
    `${variant} isolates consent by provider and chat/person`,
    { timeout: 5000 },
    async () =>
      withSdkConsent(
        variant,
        'prepare',
        async ({ store, draft, release, pending, effects }) => {
          await saveSettings(store, {
            optOut: [
              { source: 'hh', chat: draft.chat },
              { source: draft.source, chat: draft.contact },
              { source: draft.source, contact: draft.chat },
            ],
          });
          release.resolve();
          assert.equal((await pending).error, undefined);
          assert.deepEqual(effects, ['api']);
        }
      )
  );
  for (const scope of ['chat', 'contact']) {
    test(
      `${variant} checks ${scope} consent after SDK preparation`,
      { timeout: 5000 },
      async () =>
        withSdkConsent(
          variant,
          'prepare',
          async ({ store, draft, release, pending, effects }) => {
            await withdrawConsent(store, draft, scope);
            release.resolve();
            assertConsentRefusal(await pending);
            assert.deepEqual(effects, []);
          }
        )
    );
  }
  test(
    `${variant} refuses unreadable settings before provider dispatch`,
    { timeout: 5000 },
    async () =>
      withSdkConsent(
        variant,
        'prepare',
        async ({ store, release, pending, effects }) => {
          refuseConsentReads(
            store,
            'unavailable password=fixture-private-value'
          );
          release.resolve();
          const outcome = await pending;
          assertConsentRefusal(outcome, 'safety-settings-unavailable');
          assert.ok(!outcome.error.message.includes('fixture-private-value'));
          assert.deepEqual(effects, []);
        }
      )
  );
  test(
    `${variant} preserves its positive receipt after a later opt-out`,
    { timeout: 5000 },
    async () =>
      withSdkConsent(
        variant,
        'issued',
        async ({ store, draft, release, pending, effects }) => {
          await withdrawConsent(store, draft);
          release.resolve();
          const outcome = await pending;
          assert.equal(outcome.error, undefined);
          assert.equal(outcome.result.via, 'api');
          assert.deepEqual(effects, ['api']);
        }
      )
  );
}

test(
  'API consent and recipient stay bound while the caller edits its draft',
  { timeout: 5000 },
  async () =>
    withSdkConsent(
      'vk-limiter',
      'prepare',
      async ({ store, draft, release, pending, effects }) => {
        await withdrawConsent(store, draft, 'contact');
        draft.source = 'telegram';
        draft.chat = 'other';
        draft.contact = 'someone-else';
        release.resolve();
        assertConsentRefusal(await pending);
        assert.deepEqual(effects, []);
      }
    )
);
