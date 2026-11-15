import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

// One finite owned browser; test rapid native events without the user's server.
const browser = await webkit.launch({ headless: true });
let fixture;
try {
  fixture = await vacancyBrowserFixture(browser);
  const { page } = fixture;
  await page.goto(`${fixture.base}/#/cv`);
  await page.locator('[data-vacancy-field="query"]').waitFor();
  await page.evaluate(() => {
    for (const [key, value, prototype] of [
      ['excludeText', 'final paragraph', HTMLTextAreaElement.prototype],
      ['query', 'Python', HTMLInputElement.prototype],
    ]) {
      const field = document.querySelector(`[data-vacancy-field="${key}"]`);
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(
        field,
        value
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.locator('[data-vacancy-action="search"]').click();
  await page.locator('[data-vacancy-selection-summary="current"]').waitFor();
  const state = await page.evaluate(() => ({
    query: document.querySelector('[data-vacancy-field="query"]').value,
    excludeText: document.querySelector('[data-vacancy-field="excludeText"]')
      .value,
    decisions: [...document.querySelectorAll('[data-vacancy-selection]')].map(
      (node) => node.dataset.vacancySelection
    ),
  }));
  console.log(JSON.stringify(state));
  assert.equal(state.query, 'Python');
  assert.equal(state.excludeText, 'final paragraph');
  assert.equal(state.decisions[0], 'needs-description');
} finally {
  await fixture?.close();
  await browser.close();
}
