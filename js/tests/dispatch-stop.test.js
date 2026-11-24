import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import {
  sdkVariants,
  withSdkConsent,
} from '../../experiments/issue-56/consent-sdk-fixture.mjs';
import { withBrowserSendConsent } from '../../experiments/issue-56/consent-browser-send-fixture.mjs';
import { withBrowserAnswerConsent } from '../../experiments/issue-56/consent-browser-answer-fixture.mjs';
import { withProviderConsent } from '../../experiments/issue-56/consent-provider-fixture.mjs';
import {
  assertConsentRefusal,
  consentOutcome,
} from '../../experiments/issue-56/consent-fixture.mjs';
import { createBrowserSendConsent } from '../src/sources/browser-send-consent.js';
import { createMemoryStore } from '../src/storage/universal.js';
import { SETTINGS_ID } from '../src/automation/safety.js';

for (const variant of sdkVariants) {
  for (const stage of ['prepare', 'issued']) {
    test(
      `${variant} handles Stop during SDK ${stage}`,
      { timeout: 5000 },
      async () => {
        const controller = new AbortController();
        await withSdkConsent(
          variant,
          stage,
          async ({ release, pending, effects }) => {
            controller.abort();
            release.resolve();
            const outcome = await pending;
            if (stage === 'prepare') {
              assertConsentRefusal(outcome, 'stopped');
              assert.equal(outcome.error.definitive, true);
              assert.deepEqual(effects, []);
            } else {
              assert.equal(outcome.error, undefined);
              assert.equal(outcome.result.via, 'api');
              assert.deepEqual(effects, ['api']);
            }
          },
          { signal: controller.signal }
        );
      }
    );
  }
}

for (const browser of [false, true]) {
  test(
    `${browser ? 'browser' : 'API'} retains uncertainty when Stop follows an issued request`,
    { timeout: 5000 },
    async () => {
      const controller = new AbortController();
      const check = async ({ release, pending, effects }) => {
        controller.abort();
        release.reject(new Error('Issued request lost its receipt'));
        const { result, error } = await pending;
        assert.equal(result, undefined);
        assert.equal(error.ambiguous, true);
        assert.notEqual(error.fallback, true);
        if (!browser) {
          assert.equal(error.outcome, 'unknown');
          assert.equal(error.code, 'send-unknown');
        }
        assert.equal(effects.length, 1);
      };
      const dispatch = { signal: controller.signal };
      if (browser) {
        await withBrowserSendConsent('vk', 'issued', check, dispatch);
      } else {
        await withSdkConsent('vk-limiter', 'issued', check, dispatch);
      }
    }
  );
}

for (const source of ['vk', 'telegram', 'whatsapp']) {
  const stages =
    source === 'whatsapp'
      ? ['open', 'focus', 'button']
      : ['open', 'focus', 'type', 'fill', 'button'];
  for (const stage of [...stages, 'issued']) {
    test(
      `${source} handles Stop during browser ${stage}`,
      { timeout: 5000 },
      async () => {
        const controller = new AbortController();
        await withBrowserSendConsent(
          source,
          stage,
          async ({ release, pending, effects }) => {
            controller.abort();
            release.resolve();
            const outcome = await pending;
            if (stage === 'issued') {
              assert.equal(outcome.error, undefined);
              assert.equal(outcome.result.via, 'browser');
              assert.equal(effects.length, 1);
            } else {
              assertConsentRefusal(outcome, 'stopped');
              assert.deepEqual(effects, []);
            }
          },
          { signal: controller.signal }
        );
      }
    );
  }
}

for (const stage of ['open', 'document', 'arm', 'receipt']) {
  test(
    `native choice handles Stop during ${stage}`,
    { timeout: 5000 },
    async () => {
      const controller = new AbortController();
      await withBrowserAnswerConsent(
        'choice',
        stage,
        async ({ release, pending, state }) => {
          controller.abort();
          release.resolve();
          const outcome = await pending;
          if (stage === 'receipt') {
            assert.equal(outcome.error, undefined);
            assert.equal(outcome.result.messageId, '102');
            assert.equal(state.clicks, 1);
          } else {
            assertConsentRefusal(outcome, 'stopped');
            assert.equal(state.clicks, 0);
          }
        },
        { signal: controller.signal }
      );
    }
  );
}

for (const source of ['vk', 'telegram', 'whatsapp', 'email', 'hh']) {
  const stages = ['vk', 'telegram', 'whatsapp'].includes(source)
    ? ['options', 'fallback']
    : ['options'];
  for (const stage of stages) {
    test(
      `${source} refuses Stop after ${stage} before the next transport`,
      { timeout: 5000 },
      async () => {
        const controller = new AbortController();
        await withProviderConsent(
          source,
          stage,
          async ({ release, pending, effects }) => {
            controller.abort();
            release.resolve();
            const result = await pending;
            assert.equal(result.status, 'failed');
            assert.equal(result.code, 'stopped');
            assert.deepEqual(effects, []);
          },
          { signal: controller.signal }
        );
      }
    );
  }
}

test(
  'Stop while acknowledged settings load refuses after their read completes',
  { timeout: 5000 },
  async () => {
    const store = createMemoryStore();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const controller = new AbortController();
    const get = store.get.bind(store);
    store.get = async (id) => {
      if (id === SETTINGS_ID) {
        entered.resolve();
        await release.promise;
      }
      return get(id);
    };
    const pending = consentOutcome(
      createBrowserSendConsent(
        store,
        { source: 'vk', chat: '201' },
        { signal: controller.signal }
      )()
    );
    try {
      await entered.promise;
      controller.abort();
      release.resolve();
      assertConsentRefusal(await pending, 'stopped');
    } finally {
      release.resolve();
      await pending;
      await store.close?.();
    }
  }
);

test(
  'Stop of a queued browser send prevents another navigation without cancelling its predecessor',
  { timeout: 5000 },
  async () => {
    const controller = new AbortController();
    await withBrowserSendConsent(
      'telegram',
      'open',
      async ({ sender, draft, release, pending, effects, navigations }) => {
        const queued = consentOutcome(
          sender.send(draft, { signal: controller.signal })
        );
        await turn();
        controller.abort();
        release.resolve();
        const [first, second] = await Promise.all([pending, queued]);
        assert.equal(first.error, undefined);
        assert.equal(first.result.via, 'browser');
        assertConsentRefusal(second, 'stopped');
        assert.equal(navigations.length, 1);
        assert.equal(effects.length, 1);
      }
    );
  }
);
