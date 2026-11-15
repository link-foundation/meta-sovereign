import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  vkGreetingCatalogServer,
  greetingPhrases,
} from '../../../experiments/issue-56/vk-greeting-catalog-fixture.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';
import { decoded } from './e2e-form-review.mjs';
import { assertViewportFits } from './e2e-viewport.mjs';

export const verifyVkGreetingCatalog = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await vkGreetingCatalogServer();
  const context = await browser.newContext({
    viewport: { width: 1180, height: 950 },
  });
  const errors = [];
  context.on('page', (page) =>
    page.on('pageerror', (error) => errors.push(error.message))
  );
  try {
    await context.route('https://vk.com/sticker/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text y="48" font-size="48">👋</text></svg>',
      })
    );
    const page = await context.newPage();
    await page.addInitScript(
      ({ key, version }) => {
        globalThis.localStorage.setItem(
          key,
          JSON.stringify({ off: true, v: version })
        );
        globalThis.localStorage.setItem('metaSovereignLocale', 'en');
      },
      { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
    );
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
    for (const phone of [false, true]) {
      if (phone) {
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await page.locator('[data-greeting-presets]').scrollIntoViewIfNeeded();
      await assertViewportFits(page);
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({
          path: join(
            screenshots,
            `${before ? 'before' : 'after'}${phone ? '-phone' : ''}.png`
          ),
        });
      }
    }
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
