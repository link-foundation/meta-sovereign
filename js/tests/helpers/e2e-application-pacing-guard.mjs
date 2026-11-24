import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';
import {
  nativeApplicationQueue,
  nativeApplicationReviewRequest,
} from './application-native-request.mjs';
import { wirePost } from './vacancy-routes.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

/** Late native feedback must survive the action's unchanged refusal. */
export const verifyNativeApplicationPacingGuard = async (browser) => {
  for (const outcome of ['challenge', 'delivered']) {
    const fixture = await applicationNativeFixture(browser, {
      application: { pacingRandom: () => 0 },
    });
    try {
      const receipt = await nativeApplicationReviewRequest(
        fixture,
        'open',
        null,
        {
          applicationIntervalSeconds: 0,
        }
      );
      const owned = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url() === applicationInput.url);
      await owned.evaluate((kind) => {
        if (kind === 'challenge') {
          const input = document.createElement('input');
          input.name = 'captchaText';
          Object.defineProperty(input, 'value', {
            get() {
              throw new Error('Challenge value was read');
            },
          });
          document.body.append(input);
        } else {
          document
            .querySelector('[data-qa="vacancy-response-link-top"]')
            .remove();
          const delivered = document.createElement('a');
          delivered.setAttribute('data-qa', 'vacancy-response-link-view-topic');
          delivered.textContent = 'Application delivered';
          document.body.append(delivered);
        }
      }, outcome);
      const refused = await wirePost(
        fixture.base,
        'application-advance',
        {
          ...applicationInput,
          revision: receipt.revision,
          action: 'enter',
          confirm: true,
        },
        LINO_TEXT
      );
      assert.equal(refused.value.code, 'jobs-application-changed');
      const before = (await nativeApplicationQueue(fixture)).pacing;
      assert.equal(before.challenges, outcome === 'challenge' ? 1 : 0);
      assert.equal(before.deliveries, outcome === 'delivered' ? 1 : 0);
      await nativeApplicationReviewRequest(fixture, 'read', receipt);
      assert.deepEqual((await nativeApplicationQueue(fixture)).pacing, before);
      assert.deepEqual(
        await owned.evaluate(() => ({
          enters: globalThis.applicationEntries,
          sends: globalThis.applicationAttempts,
        })),
        { enters: 0, sends: 0 }
      );
      assert.deepEqual(fixture.errors, []);
    } finally {
      await fixture.close();
    }
    assert(fixture.records.every((record) => record.closed));
  }
  return { lateNativeOutcomes: 2, sends: 0, browsersClosed: true };
};
