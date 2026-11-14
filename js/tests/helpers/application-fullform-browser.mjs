import assert from 'node:assert/strict';
import { join } from 'node:path';
import { nativeApplicationForm } from './application-native-request.mjs';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';

/** Changing the actual entry element after inspection refuses navigation in the same turn. */
export const verifyFullFormNavigationGuard = async (page) => {
  const target = await page.$(applicationSelectors.enter);
  assert(target);
  try {
    const input = {
      url: 'https://hh.ru/vacancy/123',
      selectors: applicationSelectors,
    };
    const snapshot = await target.evaluate(applicationDocument, input);
    const original = await target.textContent();
    await target.evaluate((node) => {
      node.textContent = 'Changed owner control';
    });
    try {
      assert.deepEqual(
        await target.evaluate(applicationDocument, {
          ...input,
          action: 'fullForm',
          guard: JSON.stringify(snapshot),
        }),
        { dispatched: false }
      );
      assert.equal(page.url(), input.url);
      assert.equal(await page.evaluate(() => globalThis.applicationEntries), 0);
    } finally {
      await target.evaluate((node, text) => {
        node.textContent = text;
      }, original);
    }
  } finally {
    await target.dispose();
  }
};

export const openFullFormReview = async (
  controls,
  browser,
  { fullForm, screenshots }
) => {
  const { panel, action } = controls;
  if (fullForm) {
    if (process.env.APPLICATION_FULLFORM_BEFORE === '1' && screenshots) {
      await panel.screenshot({
        path: join(screenshots, 'application-fullform-before.png'),
      });
    }
    assert.equal(
      await action('form').count(),
      1,
      'Full-form review control is missing.'
    );
    assert.equal(await action('form').isDisabled(), true);
    await verifyFullFormNavigationGuard(
      nativeApplicationForm(browser, 'https://hh.ru/vacancy/123')
    );
  }
  try {
    await controls.confirmed(fullForm ? 'form' : 'enter');
  } catch (error) {
    if (process.env.MS_JOBS_APPLICATION_DEBUG === '1') {
      console.error('Synthetic review panel:', await panel.innerText());
    }
    throw error;
  }
  const owned = nativeApplicationForm(browser);
  if (fullForm) {
    assert.equal(await owned.evaluate(() => globalThis.applicationEntries), 0);
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
  }
  return owned;
};
