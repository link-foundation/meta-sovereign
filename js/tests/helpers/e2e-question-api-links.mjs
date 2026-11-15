import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { questionApiLinksServer } from '../../../experiments/issue-56/question-api-links-server.mjs';
import { apiLink } from '../../../experiments/issue-56/question-api-links-fixture.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';
import { watchFixturePages } from './e2e-page-errors.mjs';
import { decoded } from './e2e-form-review.mjs';
import { assertViewportFits } from './e2e-viewport.mjs';

/** One stored Bot API conversation exercises the ordinary shared preview. */
export const verifyApiQuestionLinks = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await questionApiLinksServer();
  const context = await browser.newContext({
    viewport: { width: 1180, height: 950 },
  });
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  try {
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
    await page.goto(`${fixture.base}/#/automation`);
    await page
      .locator('[data-automation="automation:api-links"]')
      .first()
      .click();
    const pending = page.waitForResponse((response) =>
      response.url().endsWith('/api/automations/plan')
    );
    await page
      .locator('form.automation-editor')
      .getByRole('button', { name: 'Preview', exact: true })
      .click();
    const plan = await decoded(await pending);
    assert.equal(plan.drafts.length, 1);
    assert.equal(plan.drafts[0].answer.requiresReview, !before);
    const evidence = page
      .locator('.automation-plan [data-answer-evidence]')
      .first();
    await evidence.waitFor();
    const targets = evidence.locator('[data-question-links] code');
    assert.equal(await targets.count(), before ? 0 : 1);
    if (!before) {
      assert.equal(await targets.textContent(), apiLink.first);
      assert.equal(await targets.locator('a').count(), 0);
    }
    for (const phone of [false, true]) {
      if (phone) {
        await page.setViewportSize({ width: 390, height: 844 });
      }
      await evidence.scrollIntoViewIfNeeded();
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
    assert.deepEqual(fixture.stats(), { sends: 0, liveProvider: false });
    assert.deepEqual(errors, []);
    return {
      cases: 1,
      hiddenTargetVisible: !before,
      requiresReview: !before,
      pageErrors: errors,
      sends: 0,
      resourcesClosedOnExit: true,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
