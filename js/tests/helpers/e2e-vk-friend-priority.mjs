import assert from 'node:assert/strict';
import {
  friendsServer,
  friendsAdapter,
} from '../../../experiments/issue-56/vk-friends-fixture.mjs';
import {
  loadVkFriends,
  saveVkFriends,
} from '../../src/automation/vk-friends.js';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
  vkReviewedControls,
} from './vk-automation-browser.mjs';

export const verifyVkFriendPriority = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const adapter = friendsAdapter({
    methods: {
      'friends.getRequests': () => ({ count: 2, items: [7, 8] }),
    },
  });
  const fixture = await friendsServer({ adapter });
  await saveVkFriends(fixture.store, {
    ...(await loadVkFriends(fixture.store)).settings,
    priorityIds: [99],
  });
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    const { panel, ready, action } = vkReviewedControls(page, 'friends');
    await ready();
    const priority = panel.locator('[data-friend-field=priorityIds]');
    if (before) {
      assert.equal(
        await panel.locator('[data-action=vk-friends-seed-priority]').count(),
        0
      );
      await captureVkAutomationLayouts(page, priority, screenshots, 'before');
      return { missingPriorityActions: true, liveProvider: false };
    }
    await action('seed-priority');
    assert.equal(await priority.inputValue(), '99,7,8');
    await captureVkAutomationLayouts(page, priority, screenshots, 'seeded');
    fixture.refuseWrites(true);
    await action('clear-priority');
    await panel.getByRole('alert').waitFor();
    assert.equal(await priority.inputValue(), '99,7,8');
    await captureVkAutomationLayouts(page, priority, screenshots, 'refused');
    fixture.refuseWrites(false);
    await priority.fill('123');
    await panel.locator('[data-friend-field=maxFriends]').fill('42');
    await action('clear-priority');
    assert.equal(await priority.inputValue(), '');
    assert.equal(
      await panel.locator('[data-friend-field=maxFriends]').inputValue(),
      '42'
    );
    await action('save');
    await page.reload();
    await ready();
    assert.equal(await priority.inputValue(), '');
    assert.equal(
      await panel.locator('[data-friend-field=maxFriends]').inputValue(),
      '42'
    );
    await captureVkAutomationLayouts(page, priority, screenshots, 'cleared');
    assert.deepEqual(fixture.effects, []);
    assert.equal(fixture.messages(), 0);
    assert.deepEqual(errors, []);
    return {
      mergedOwnerPriorities: true,
      clearAcknowledged: true,
      refusedClearRetained: true,
      unsavedOtherFieldRetained: true,
      reloadRetained: true,
      providerWrites: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  });
};
