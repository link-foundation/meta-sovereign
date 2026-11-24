import assert from 'node:assert/strict';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';

/** Exercise the last synchronous native boundary with a freshly matching read. */
export const refuseNativeSubmit = async (page, url, observed, message) => {
  const target = await page.$(applicationSelectors.submit);
  assert(target, 'The actual native submit control must be present.');
  try {
    const input = { url, selectors: applicationSelectors };
    const snapshot = await target.evaluate(applicationDocument, input);
    observed?.(snapshot);
    const result = await target.evaluate(applicationDocument, {
      ...input,
      action: 'submit',
      guard: JSON.stringify(snapshot),
    });
    assert.equal(result.dispatched, false, message);
  } finally {
    await target.dispose();
  }
};
