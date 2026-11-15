import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gratitudeServer } from '../../../experiments/issue-56/vk-gratitude-fixture.mjs';
import { decoded } from './e2e-form-review.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkGratitude = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await gratitudeServer();
  const { context, page, errors } = await vkAutomationBrowser(browser, '🙏');
  try {
    await page.goto(`${fixture.base}/#/automation`);
    await page.locator('[data-automation="automation:greet-back"]').waitFor();
    const open = page.locator('[data-automation="automation:gratitude"]');
    assert.equal(await open.count(), before ? 0 : 1);
    if (!before) {
      await open.click();
      await page.locator('[data-gratitude-fields]').waitFor();
      assert.equal(
        await page.locator('[name="incomingRecognizer"]').inputValue(),
        'gratitude'
      );
      const editor = page.locator('.automation-editor');
      const preview = async () => {
        const waiting = page.waitForResponse((r) =>
          r.url().endsWith('/api/automations/plan')
        );
        await editor
          .getByRole('button', { name: 'Preview', exact: true })
          .click();
        return decoded(await waiting);
      };
      const plan = await preview();
      assert.deepEqual(plan.drafts.map((d) => d.chat).sort(), ['41', '42']);
      await page.locator('[data-gratitude-sticker]').first().waitFor();
      if (screenshots) {
        await mkdir(screenshots, { recursive: true });
        await page.locator('.automation-plan').scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(screenshots, 'after-sticker.png') });
      }
      await page.locator('[name="preferSticker"]').uncheck();
      await page.locator('[name="formal"]').fill('You are welcome <friend>!');
      const saving = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/automations') && r.request().method() === 'PUT'
      );
      await editor.getByRole('button', { name: 'Save', exact: true }).click();
      const saved = await decoded(await saving);
      assert.equal(saved.action.preferSticker, false);
      await page.reload();
      await open.click();
      await page.locator('[data-gratitude-fields]').waitFor();
      assert.equal(
        await page.locator('[name="formal"]').inputValue(),
        'You are welcome <friend>!'
      );
      assert.equal(
        await page.locator('[name="preferSticker"]').isChecked(),
        false
      );
      const textPlan = await preview();
      assert.ok(
        textPlan.drafts.every(
          (d) => d.text === 'You are welcome <friend>!' && !d.sticker
        )
      );
    }
    await captureVkAutomationLayouts(
      page,
      page.locator(before ? '.automation-list' : '[data-gratitude-fields]'),
      screenshots,
      before ? 'before' : 'after'
    );
    assert.deepEqual(errors, []);
    assert.equal(fixture.vk.calls.length, 0);
    return {
      cases: 1,
      gratitudeAvailable: !before,
      savedTextRestored: !before,
      pageErrors: errors,
      sends: 0,
      resourcesClosedOnExit: true,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
