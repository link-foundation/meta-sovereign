import assert from 'node:assert/strict';
import {
  vkGreetingCatalogServer,
  greetingPhrases,
} from '../../../experiments/issue-56/vk-greeting-catalog-fixture.mjs';
import { decoded } from './e2e-form-review.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkGreetingCatalog = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await vkGreetingCatalogServer();
  const { context, page, errors } = await vkAutomationBrowser(browser, '👋');
  try {
    await page.goto(`${fixture.base}/#/greetings`);
    await page.locator('[data-action="collection-add"]:enabled').waitFor();
    await page.locator('[data-greeting-presets] summary').click();
    const editor = page.locator(
      '[data-greeting-presets] textarea[data-field="texts"]'
    );
    assert.equal(await editor.count(), before ? 0 : 1);
    if (!before) {
      await editor.fill(greetingPhrases.join('\n'));
      const saving = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/greetings/selection') &&
          r.request().method() === 'PUT'
      );
      await page.locator('[data-action="greetings-save"]').click();
      assert.deepEqual((await decoded(await saving)).texts.en, greetingPhrases);
      await page.reload();
      await page.locator('[data-action="collection-add"]:enabled').waitFor();
      await page.locator('[data-greeting-presets] summary').click();
      await editor.waitFor();
      assert.equal(await editor.inputValue(), greetingPhrases.join('\n'));
    }
    await page.locator('[data-field="mode"]').selectOption('reply');
    const planning = page.waitForResponse((r) =>
      r.url().endsWith('/api/greetings/plan')
    );
    await page.locator('[data-action="greetings-preview"]').click();
    const plan = await decoded(await planning);
    assert.deepEqual(
      plan.envelopes
        .filter((e) => !e.skipped)
        .map((e) => e.chat)
        .sort(),
      before ? ['2000000001', '41', '42', '43'] : ['41', '42']
    );
    await page.locator('.greetings-plan').waitFor();
    await captureVkAutomationLayouts(
      page,
      page.locator('[data-greeting-presets]'),
      screenshots,
      before ? 'before' : 'after'
    );
    assert.deepEqual(errors, []);
    assert.equal(fixture.stats().sends, 0);
    return {
      cases: 1,
      catalogEditable: !before,
      pageErrors: errors,
      sends: 0,
      resourcesClosedOnExit: true,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
