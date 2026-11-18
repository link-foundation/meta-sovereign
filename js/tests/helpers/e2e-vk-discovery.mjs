import assert from 'node:assert/strict';
import { discoveryServer } from '../../../experiments/issue-56/vk-discovery-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkDiscovery = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await discoveryServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, heading, errors }) => {
      if (before) {
        for (const kind of ['suggestions', 'community', 'rejections']) {
          assert.equal(await page.locator(`[data-vk-${kind}]`).count(), 0);
        }
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return { missingDiscoveryControls: true, liveProvider: false };
      }
      for (const kind of ['suggestions', 'community', 'rejections']) {
        const { panel, ready, action } = vkReviewedControls(page, kind);
        await ready();
        assert.equal(
          await panel.locator(`[data-action=vk-${kind}-enabled]`).isChecked(),
          false
        );
        await panel.locator(`[data-${kind}-field=limit]`).fill('1');
        if (kind === 'community') {
          await panel.locator('[data-community-field=communityId]').fill('55');
        }
        await action('save');
        await page.reload();
        await ready();
        await action('plan');
        const summary = await panel
          .locator('[data-discovery-summary]')
          .innerText();
        assert.ok(summary.includes('3'));
        const id = { suggestions: 11, community: 7, rejections: 21 }[kind];
        assert.equal(
          await panel
            .locator(`[data-${kind}-id="${id}"][data-${kind}-reason=eligible]`)
            .count(),
          1
        );
        await captureVkAutomationLayouts(
          page,
          panel,
          screenshots,
          `${kind}-review`
        );
        await action('run');
        await panel.locator(`[data-vk-${kind}-status=confirmed]`).waitFor();
        await page.reload();
        await ready();
        await action('plan');
        assert.equal(
          await panel
            .locator(`[data-${kind}-id="${id}"][data-${kind}-reason=eligible]`)
            .count(),
          0
        );
        await captureVkAutomationLayouts(
          page,
          panel.locator(`[data-vk-${kind}-status]`),
          screenshots,
          `${kind}-after`
        );
      }
      assert.deepEqual(fixture.effects, [
        { kind: 'add', id: 11 },
        { kind: 'add', id: 7 },
        { kind: 'delete', id: 21 },
      ]);
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        rankedSuggestion: 11,
        communityRequest: 7,
        deactivatedRejection: 21,
        independentPolicies: 3,
        noReplayAfterReload: true,
        pageErrors: 0,
        liveProvider: false,
      };
    }
  );
};
