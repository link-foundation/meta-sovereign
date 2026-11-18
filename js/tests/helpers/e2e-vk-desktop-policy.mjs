import assert from 'node:assert/strict';
import { desktopServer } from '../../../experiments/issue-56/vk-desktop-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
export const verifyVkDesktopPolicy = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await desktopServer();
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    const panel = page.locator('[data-vk-friends]');
    const choice = panel.locator('[data-friend-field=acceptancePolicy]');
    const ready = () =>
      page.waitForFunction(() => {
        const input = document.querySelector(
          '[data-action=vk-friends-enabled]'
        );
        return input && !input.disabled;
      });
    await ready();
    if (before) {
      assert.equal(await choice.count(), 0);
      await captureVkAutomationLayouts(page, panel, screenshots, 'before');
      return {
        missingDesktopChoice: true,
        providerEffects: fixture.effects.length,
      };
    }
    assert.equal(await choice.inputValue(), 'ranked-batch');
    await choice.selectOption('desktop-ten-percent');
    await ready();
    await page.reload();
    await ready();
    assert.equal(await choice.inputValue(), 'desktop-ten-percent');
    const preview = async () => {
      await panel.locator('[data-action=vk-friends-plan]').click();
      await ready();
      await panel.locator('[data-vk-friends-plan=review]').waitFor();
    };
    const confirm = async (status) => {
      await panel.locator('[data-action=vk-friends-run]').click();
      await ready();
      await panel.locator(`[data-vk-friends-status=${status}]`).waitFor();
    };
    await preview();
    assert.equal(
      await panel.locator('[data-friend-reason=eligible]').count(),
      2
    );
    assert.equal(await panel.locator('[data-friend-reason=quota]').count(), 18);
    assert.equal(fixture.effects.length, 0);
    await captureVkAutomationLayouts(
      page,
      panel.locator('[data-friend-quota]'),
      screenshots,
      'review'
    );
    await confirm('confirmed');
    assert.deepEqual(fixture.effects, [109, 119]);
    await preview();
    assert.equal(await panel.locator('[data-friend-reason=quota]').count(), 18);
    await panel.locator('[data-friend-field=maxFriends]').fill('1');
    await panel.locator('[data-friend-field=batchSize]').fill('2');
    await panel.locator('[data-action=vk-friends-save]').click();
    await ready();
    await preview();
    await confirm('confirmed');
    assert.deepEqual(fixture.effects, [109, 119, 102, 101]);
    await captureVkAutomationLayouts(
      page,
      panel.locator('[data-vk-friends-status]'),
      screenshots,
      'after'
    );
    fixture.mode('unknown');
    await preview();
    await confirm('unknown');
    await page.reload();
    await ready();
    await preview();
    assert.equal(
      await panel.locator('[data-friend-reason=unknown]').count(),
      1
    );
    await captureVkAutomationLayouts(
      page,
      panel.locator('[data-vk-friends-status]'),
      screenshots,
      'unknown'
    );
    fixture.refuseWrites(true);
    await choice.selectOption('ranked-batch');
    await panel.getByRole('alert').waitFor();
    assert.equal(await choice.inputValue(), 'desktop-ten-percent');
    assert.equal(fixture.effects.length, 5);
    assert.equal(fixture.messages(), 0);
    assert.deepEqual(errors, []);
    return {
      savedPolicy: true,
      lifetimeQuota: true,
      mutualOnly: true,
      unknownRetained: true,
      failedSaveRetained: true,
      syntheticFriendCalls: 5,
      messages: 0,
      pageErrors: 0,
    };
  });
};
