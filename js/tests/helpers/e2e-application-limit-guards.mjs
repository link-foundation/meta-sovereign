import assert from 'node:assert/strict';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';

/** Exercise the real synchronous guard between its snapshot and navigation. */
export const verifyApplicationLimitRefreshGuards = async (page) => {
  const input = {
    url: 'https://hh.ru/vacancy/123',
    selectors: applicationSelectors,
  };
  const answer = await page.locator('#experience').inputValue();
  for (const change of ['answer', 'target', 'challenge']) {
    const target = await page.$(applicationSelectors.submit);
    const guard = JSON.stringify(
      await target.evaluate(applicationDocument, input)
    );
    try {
      if (change === 'answer') {
        await page
          .locator('#experience')
          .fill('Owner changed after the snapshot.');
      } else if (change === 'target') {
        await target.evaluate((node) => node.replaceWith(node.cloneNode(true)));
      } else {
        await page.evaluate(() => {
          const challenge = document.createElement('input');
          challenge.name = 'captcha';
          document.body.append(challenge);
        });
      }
      assert.deepEqual(
        await target.evaluate(applicationDocument, {
          ...input,
          action: 'limitRefresh',
          guard,
        }),
        { navigated: false }
      );
      assert.equal(
        await page.evaluate(() => globalThis.applicationAttempts),
        0
      );
    } finally {
      if (change === 'answer') {
        await page.locator('#experience').fill(answer);
      } else if (change === 'target') {
        await target.evaluate((node) =>
          document
            .querySelector('[data-qa="vacancy-response-letter-submit"]')
            .replaceWith(node)
        );
      } else {
        await page
          .locator('input[name="captcha"]')
          .evaluate((node) => node.remove());
      }
      await target.dispose();
    }
  }
  return 3;
};
