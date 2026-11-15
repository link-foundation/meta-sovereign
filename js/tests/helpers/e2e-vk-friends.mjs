import assert from 'node:assert/strict';
import { friendsServer } from '../../../experiments/issue-56/vk-friends-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkFriends = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await friendsServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const panel = page.locator('[data-vk-friends]');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingFriendControls: true,
          providerEffects: fixture.effects.length,
        };
      }
      const ready = () =>
        page.waitForFunction(() => {
          const input = document.querySelector(
            '[data-action=vk-friends-enabled]'
          );
          return input && !input.disabled;
        });
      await ready();
      const enabled = panel.locator('[data-action=vk-friends-enabled]');
      assert.equal(await enabled.isChecked(), false);
      await panel.locator('[data-friend-field=priorityIds]').fill('7,8');
      await panel.locator('[data-friend-field=maxFriends]').fill('3');
      await panel.locator('[data-action=vk-friends-save]').click();
      await ready();
      await page.reload();
      await ready();
      assert.equal(
        await panel.locator('[data-friend-field=priorityIds]').inputValue(),
        '7,8'
      );
      await panel.locator('[data-action=vk-friends-plan]').click();
      await ready();
      await panel.locator('[data-vk-friends-plan=review]').waitFor();
      assert.equal(fixture.effects.length, 0);
      assert.match(
        await panel.locator('[data-friend-id="11"]').innerText(),
        /capacity/
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-friends-plan]'),
        screenshots,
        'review'
      );
      await panel.locator('[data-action=vk-friends-run]').click();
      await ready();
      await panel.locator('[data-vk-friends-status=confirmed]').waitFor();
      assert.deepEqual(fixture.effects, [7, 9]);
      assert.equal(
        await panel.locator('[data-action=vk-friends-run]').isDisabled(),
        true
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-friends-status]'),
        screenshots,
        'after'
      );
      fixture.count(1);
      fixture.mode('unknown');
      await panel.locator('[data-action=vk-friends-plan]').click();
      await ready();
      await panel.locator('[data-action=vk-friends-run]').click();
      await ready();
      await panel.locator('[data-vk-friends-status=unknown]').waitFor();
      await page.reload();
      await ready();
      await panel.locator('[data-action=vk-friends-plan]').click();
      await ready();
      assert.match(
        await panel.locator('[data-friend-id="11"]').innerText(),
        /Unknown outcome/
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-friends-status]'),
        screenshots,
        'after-unknown'
      );
      fixture.refuseWrites(true);
      await enabled.click();
      await panel.getByRole('alert').waitFor();
      assert.equal(await enabled.isChecked(), false);
      assert.deepEqual(fixture.effects, [7, 9, 11]);
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        priorityFirst: true,
        cap: true,
        reviewedActions: true,
        unknownRetained: true,
        failedSaveRetained: true,
        syntheticFriendCalls: 3,
        messages: 0,
        pageErrors: 0,
      };
    }
  );
};
