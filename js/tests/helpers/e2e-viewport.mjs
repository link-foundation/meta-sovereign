import assert from 'node:assert/strict';

/** Shared question review layout assertion; retain the actual viewport bounds. */
export const assertViewportFits = async (page) => {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= globalThis.innerWidth
  );
  assert.equal(fits, true, 'The review must fit the current viewport');
};
