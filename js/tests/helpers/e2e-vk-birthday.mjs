import assert from 'node:assert/strict';
import {
  birthdayAdapter,
  birthdayServer,
} from '../../../experiments/issue-56/vk-birthday-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
export const verifyVkBirthday = async (
  browser,
  { before = false, screenshots } = {}
) =>
  reviewVkConnection(
    browser,
    await birthdayServer({
      adapter: birthdayAdapter({
        response: (_effect, count) => (count === 2 ? 'refused' : 'confirmed'),
      }),
    }),
    async ({ page, heading, errors }) => {
      const { panel, ready, action } = vkReviewedControls(page, 'birthday');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return { missingBirthdayControls: true, liveProvider: false };
      }
      await ready();
      assert.equal(
        await panel.locator('[data-action=vk-birthday-enabled]').isChecked(),
        false
      );
      for (const [key, value] of [
        ['timeZone', 'UTC'],
        ['messages', 'Happy birthday!'],
        ['stickers', '60302'],
        ['attachments', 'video1_23'],
      ]) {
        await panel.locator(`[data-birthday-field=${key}]`).fill(value);
      }
      await action('save');
      await page.reload();
      await ready();
      assert.equal(
        await panel.locator('[data-birthday-field=attachments]').inputValue(),
        'video1_23'
      );
      await action('plan');
      assert.equal(
        await panel.locator('[data-personal-sequence] li').count(),
        2
      );
      assert.ok(
        (await panel.locator('[data-birthday-date]').innerText()).includes(
          '2026-11-15'
        )
      );
      assert.ok(
        (await panel.locator('[data-personal-sequence]').innerText()).includes(
          'video1_23'
        )
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-birthday-plan]'),
        screenshots,
        'review'
      );
      await action('run');
      await panel.locator('[data-vk-birthday-status=refused]').waitFor();
      await action('plan');
      assert.equal(
        await panel
          .locator('[data-sequence-receipt]:not([data-sequence-receipt=""])')
          .count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-birthday-plan]'),
        screenshots,
        'partial'
      );
      await action('run');
      await panel.locator('[data-vk-birthday-status=confirmed]').waitFor();
      await action('plan');
      assert.equal(
        await panel
          .locator('[data-sequence-receipt]:not([data-sequence-receipt=""])')
          .count(),
        2
      );
      assert.equal(
        await panel.locator('[data-birthday-reason=cooldown]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-birthday-status]'),
        screenshots,
        'after'
      );
      assert.deepEqual(errors, []);
      return {
        orderedBirthday: true,
        reviewedDate: true,
        dayDeduplication: true,
        partialReceiptRetained: true,
        pageErrors: 0,
        liveProvider: false,
      };
    }
  );
