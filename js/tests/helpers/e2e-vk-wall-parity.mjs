import assert from 'node:assert/strict';
import { wallServer } from '../../../experiments/issue-56/vk-wall-fixture.mjs';
import { wallParityAdapter } from '../../../experiments/issue-56/vk-wall-parity-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkWallParity = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const adapter = wallParityAdapter();
  adapter.addPost(42, 'Add me as a friend: visible other author', {
    from_id: 2,
  });
  const fixture = await wallServer({ adapter });
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const { panel, ready, action, review, deliver } = vkReviewedControls(
        page,
        'wall'
      );
      await ready();
      const any = panel.locator('[data-wall-field=holdAnyVisible]');
      if (before) {
        assert.equal(await any.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingAnyAuthorControl: true,
          providerEffects: fixture.effects.length,
        };
      }
      assert.equal(await any.isChecked(), false);
      await panel.locator('[data-wall-field=communities]').fill('42');
      await panel.locator('[data-wall-field=replaceOwned]').check();
      await any.check();
      await action('save');
      await review('visibleInvitation');
      assert.equal(fixture.effects.length, 0);
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-wall-plan]'),
        screenshots,
        'held'
      );
      await any.uncheck();
      await action('save');
      await review('eligible');
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-wall-plan]'),
        screenshots,
        'review'
      );
      await deliver('confirmed');
      assert.ok(
        (await panel.locator('[data-wall-remaining]').innerText()).endsWith('—')
      );
      assert.equal(await panel.locator('[data-wall-post-receipt]').count(), 1);
      assert.deepEqual(
        fixture.effects.map((step) => step.action),
        ['post', 'delete', 'delete']
      );
      assert.ok(
        (await panel.locator('[data-wall-absent]').innerText()).includes(
          'without a deletion receipt'
        )
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-wall-absent]'),
        screenshots,
        'after'
      );
      await page.reload();
      await ready();
      assert.equal(await any.isChecked(), false);
      await review('visible');
      await any.check();
      await action('save');
      await review('visibleInvitation');
      assert.equal(fixture.effects.length, 3);
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        anyAuthorHold: true,
        confirmedAbsence: true,
        distinctDeletionReceipt: true,
        retainedAfterReload: true,
        syntheticCalls: 3,
        pageErrors: 0,
      };
    }
  );
};
