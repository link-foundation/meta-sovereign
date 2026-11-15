import assert from 'node:assert/strict';
import { greetServer } from '../../../experiments/issue-56/vk-greet-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkGreet = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await greetServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const { panel, ready, action } = vkReviewedControls(page, 'greet');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingGreetingControls: true,
          providerEffects: fixture.effects.length,
        };
      }
      await ready();
      assert.equal(
        await panel.locator('[data-action=vk-greet-enabled]').isChecked(),
        false
      );
      assert.equal(
        await panel.locator('[data-greet-field=onlineOnly]').isChecked(),
        true
      );
      await panel.locator('[data-greet-field=limit]').fill('1');
      await panel.locator('[data-greet-field=message]').fill('Hello, friend.');
      await action('save');
      await page.reload();
      await ready();
      assert.equal(
        await panel.locator('[data-greet-field=message]').inputValue(),
        'Hello, friend.'
      );
      await action('plan');
      await panel.locator('[data-vk-greet-plan=review]').waitFor();
      assert.equal(fixture.effects.length, 0);
      assert.equal(
        await panel
          .locator('[data-greet-id="9"] [data-greet-message]')
          .innerText(),
        'Hello, friend.'
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-greet-plan]'),
        screenshots,
        'review'
      );
      await action('run');
      await panel.locator('[data-vk-greet-status=confirmed]').waitFor();
      await action('plan');
      assert.equal(
        await panel.locator('[data-greet-reason=cooldown]').count(),
        1
      );
      assert.equal(fixture.effects.length, 1);
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-greet-status]'),
        screenshots,
        'after'
      );
      fixture.mode('unknown');
      await panel.locator('[data-greet-field=limit]').fill('2');
      await action('save');
      await action('plan');
      await action('run');
      await panel.locator('[data-vk-greet-status=unknown]').waitFor();
      await page.reload();
      await ready();
      await action('plan');
      assert.equal(
        await panel.locator('[data-greet-reason=unknown]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-greet-status]'),
        screenshots,
        'unknown'
      );
      fixture.refuseWrites(true);
      await panel.locator('[data-action=vk-greet-enabled]').click();
      await panel.getByRole('alert').waitFor();
      assert.equal(
        await panel.locator('[data-action=vk-greet-enabled]').isChecked(),
        false
      );
      assert.equal(fixture.effects.length, 2);
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        savedFilters: true,
        exactReview: true,
        cooldown: true,
        unknownRetained: true,
        failedSaveRetained: true,
        syntheticGreetingCalls: 2,
        pageErrors: 0,
      };
    }
  );
};
