import assert from 'node:assert/strict';
import {
  retentionAdapter,
  retentionServer,
} from '../../../experiments/issue-56/vk-retention-fixture.mjs';
import { isTombstone } from '../../src/storage/soft-delete.js';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
export const verifyVkRetention = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await retentionServer({
    adapter: retentionAdapter({
      count: 103,
      fallback: true,
      response: (_method, n) => (n === 3 ? 'refused' : undefined),
    }),
  });
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, heading, errors }) => {
      const { panel, ready, action } = vkReviewedControls(page, 'retention');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return { missingRetentionControls: true, liveProvider: false };
      }
      await ready();
      assert.equal(
        await panel.locator('[data-action=vk-retention-enabled]').isChecked(),
        false
      );
      await panel.locator('[data-retention-field=peers]').fill('9');
      await panel.locator('[data-retention-field=threshold]').fill('1');
      await action('save');
      await page.reload();
      await ready();
      assert.equal(
        await panel.locator('[data-retention-field=peers]').inputValue(),
        '9'
      );
      await action('plan');
      assert.ok(
        (await panel.locator('[data-retention-evidence]').innerText()).includes(
          '103'
        )
      );
      assert.equal(fixture.effects.length, 0);
      await captureVkAutomationLayouts(page, panel, screenshots, 'review');
      await action('run');
      await panel.locator('[data-vk-retention-status=refused]').waitFor();
      assert.equal(isTombstone(await fixture.store.get('msg:vk:1')), false);
      await action('plan');
      const evidence = await panel
        .locator('[data-retention-evidence]')
        .innerText();
      assert.ok(evidence.includes('100'));
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-retention-plan]'),
        screenshots,
        'partial'
      );
      await action('run');
      await panel.locator('[data-vk-retention-status=confirmed]').waitFor();
      assert.equal(fixture.effects.length, 4);
      assert.equal(isTombstone(await fixture.store.get('msg:vk:1')), true);
      assert.equal((await fixture.store.get('msg:vk:1')).body, 'History 1');
      await action('plan');
      assert.equal(
        await panel.locator('[data-retention-reason=belowThreshold]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-retention-status]'),
        screenshots,
        'after'
      );
      assert.deepEqual(errors, []);
      return {
        reviewedRetention: true,
        remainingOnlyRecovery: true,
        recoverableLocalMessages: 103,
        providerCalls: 4,
        pageErrors: 0,
        liveProvider: false,
      };
    }
  );
};
