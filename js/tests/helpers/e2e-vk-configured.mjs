import assert from 'node:assert/strict';
import { loadVkFriends } from '../../src/automation/vk-friends.js';
import { dictionaries } from '../../src/web/locales/index.js';
import { desktopServer } from '../../../experiments/issue-56/vk-desktop-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
  vkReviewedControls,
} from './vk-automation-browser.mjs';

/** One private finite native account, with explicit review before two writes. */
export const verifyVkConfigured = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await desktopServer();
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    const { panel, ready, action } = vkReviewedControls(page, 'friends');
    const choice = panel.locator('[data-friend-field=acceptancePolicy]');
    const percentage = panel.locator('[data-friend-field=topPercentMutuals]');
    await ready();
    if (before) {
      assert.equal(
        await choice.locator('option[value=desktop-configured]').count(),
        0
      );
      await choice.selectOption('desktop-ten-percent');
      await ready();
      assert.equal(await percentage.count(), 0);
      await captureVkAutomationLayouts(
        page,
        choice,
        screenshots,
        'before',
        true
      );
      assert.deepEqual(fixture.effects, []);
      return {
        missingCapacityMode: true,
        missingPercentage: true,
        syntheticFriendCalls: 0,
        liveProvider: false,
      };
    }
    await choice.selectOption('desktop-configured');
    await ready();
    assert.equal(await percentage.inputValue(), '10');
    await percentage.fill('25');
    await panel.locator('[data-friend-field=maxFriends]').fill('3');
    await action('save');
    await page.reload();
    await ready();
    assert.equal(await choice.inputValue(), 'desktop-configured');
    assert.equal(await percentage.inputValue(), '25');
    await captureVkAutomationLayouts(page, choice, screenshots, 'after', true);
    await action('plan');
    assert.equal(
      await panel.locator('[data-friend-reason=eligible]').count(),
      2
    );
    assert.equal(
      await panel.locator('[data-friend-reason=capacity]').count(),
      18
    );
    assert.equal(fixture.effects.length, 0);
    await action('run');
    await panel.locator('[data-vk-friends-status=confirmed]').waitFor();
    assert.deepEqual(fixture.effects, [109, 119]);
    await action('plan');
    assert.equal(
      await panel.locator('[data-friend-reason=eligible]').count(),
      0
    );
    await panel.locator('[data-friend-field=maxFriends]').fill('10000');
    await percentage.fill('20');
    await action('save');
    await action('plan');
    assert.equal(
      await panel.locator('[data-friend-reason=eligible]').count(),
      2
    );
    fixture.refuseWrites(true);
    await percentage.fill('35');
    await action('save');
    await panel.getByRole('alert').waitFor();
    assert.equal(
      await percentage.inputValue(),
      '35',
      'refused owner draft remains editable'
    );
    assert.equal(
      (await loadVkFriends(fixture.store)).settings.topPercentMutuals,
      20
    );
    fixture.refuseWrites(false);
    await page.reload();
    await ready();
    assert.equal(await percentage.inputValue(), '20');
    for (const language of ['en', 'ru', 'hi', 'zh']) {
      await page
        .locator('[data-action=language-switcher] select')
        .selectOption(language);
      const words = dictionaries[language];
      await panel
        .getByText(words['vkFriends.topPercentMutuals'], { exact: true })
        .waitFor();
      assert.equal(await choice.inputValue(), 'desktop-configured');
      assert.ok(
        (await panel.innerText()).includes(
          words['vkFriends.configuredHint'].replace('{percent}', '20')
        )
      );
    }
    assert.deepEqual(
      fixture.effects,
      [109, 119],
      'reload and locale changes never replay writes'
    );
    assert.equal(fixture.messages(), 0);
    assert.deepEqual(errors, []);
    return {
      configuredPercentage: true,
      configuredCapacity: true,
      reservationsRetained: true,
      failedSaveDraftRetained: true,
      reloadRetained: true,
      locales: 4,
      syntheticFriendCalls: 2,
      messages: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  });
};
