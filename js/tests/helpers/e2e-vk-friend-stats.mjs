import assert from 'node:assert/strict';
import {
  friendsJob,
  friendsServer,
} from '../../../experiments/issue-56/vk-friends-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
  vkReviewedControls,
} from './vk-automation-browser.mjs';

export const verifyVkFriendStats = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await friendsServer();
  await fixture.store.putMany([
    {
      id: 'msg:vk:88:1',
      source: 'vk',
      chat: '88',
      chatName: 'Fixture conversation',
      chatType: 'personal_chat',
      sender: '88',
      body: 'Previously read fixture message',
      timestamp: new Date().toISOString(),
      raw: { id: 1 },
    },
    {
      id: 'read:vk:88',
      tokens: ['read', 'vk', '88'],
      kind: 'read',
      source: 'vk',
      chat: '88',
      inboxMaxId: 1,
      unreadTopId: 1,
      unreadCount: 0,
    },
  ]);
  if (before) {
    const job = friendsJob(fixture.store, fixture);
    try {
      await job.run({
        planId: (await job.preview()).plan.planId,
        confirm: true,
      });
    } finally {
      await job.stop();
    }
  }
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const banner = page.locator('[data-vk-friend-stats]');
      const summary = page.locator('[data-vk-friend-stats-account="1"]');
      const { panel, ready, action } = vkReviewedControls(page, 'friends');
      await ready();
      assert.equal(await banner.count(), 0);
      if (before) {
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingSummary: true,
          syntheticAcceptances: fixture.effects.length,
        };
      }
      await action('plan');
      assert.equal(fixture.effects.length, 0);
      await action('run');
      await panel.locator('[data-vk-friends-status=confirmed]').waitFor();
      await summary.waitFor();
      assert.match(await summary.innerText(), /2/);
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.match(await banner.innerText(), /Initial observed friends: 1/);
      assert.match(await banner.innerText(), /UTC/);
      await captureVkAutomationLayouts(page, banner, screenshots, 'after');

      await page.route('**/api/vk/friends/stats', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'text/plain',
          body: 'Fixture statistics unavailable',
        })
      );
      const refresh = () =>
        page.evaluate(() =>
          globalThis.dispatchEvent(
            new globalThis.Event('ms-vk-friend-stats-updated')
          )
        );
      await refresh();
      await banner.getByRole('status').waitFor();
      assert.match(
        await banner.getByRole('status').innerText(),
        /last saved counts/
      );
      assert.match(await summary.innerText(), /2/);
      await captureVkAutomationLayouts(
        page,
        banner,
        screenshots,
        'after-stale'
      );
      await page.unroute('**/api/vk/friends/stats');
      await refresh();
      await banner.getByRole('status').waitFor({ state: 'detached' });
      await page.reload();
      await summary.waitFor();
      assert.match(await summary.innerText(), /2/);
      for (const route of ['chat', 'operator']) {
        await page.evaluate((hash) => {
          globalThis.location.hash = hash;
        }, route);
        await summary.waitFor();
        assert.match(await summary.innerText(), /2/);
        if (route === 'operator') {
          await page.locator('.operator-workspace').waitFor();
          await summary.click();
          assert.equal(
            await page.evaluate(() => {
              const workspace = document
                .querySelector('.operator-workspace')
                .getBoundingClientRect();
              const main = document
                .querySelector('main')
                .getBoundingClientRect();
              return (
                workspace.height > 160 &&
                workspace.bottom <= main.bottom + 1 &&
                main.bottom <= globalThis.innerHeight + 1
              );
            }),
            true
          );
        }
        await captureVkAutomationLayouts(
          page,
          banner,
          screenshots,
          `after-${route}`
        );
      }
      assert.deepEqual(fixture.effects, [9, 11]);
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        syntheticAcceptances: 2,
        actualProvider: false,
        summaryAfterReceipt: true,
        initialCount: 1,
        staleRetained: true,
        recovery: true,
        reload: true,
        sharedSurfaces: ['VK', 'Chat', 'Operator'],
        pageErrors: 0,
      };
    }
  );
};
