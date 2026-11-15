import assert from 'node:assert/strict';
import { reengageServer } from '../../../experiments/issue-56/vk-reengage-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkReengage = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await reengageServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const { panel, ready, action } = vkReviewedControls(page, 'music');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingReengageControls: true,
          providerEffects: fixture.effects.length,
        };
      }
      await ready();
      assert.equal(
        await panel.locator('[data-action=vk-music-enabled]').isChecked(),
        false
      );
      assert.equal(
        await panel.locator('[data-music-field=onlineOnly]').isChecked(),
        true
      );
      for (const [key, value] of [
        ['greeting', 'Hello again!'],
        ['questions', 'What do you think of this track?'],
        ['audio', 'audio-1_23'],
      ]) {
        await panel.locator(`[data-music-field=${key}]`).fill(value);
      }
      await action('save');
      await page.reload();
      await ready();
      assert.equal(
        await panel.locator('[data-music-field=audio]').inputValue(),
        'audio-1_23'
      );
      await action('plan');
      assert.equal(
        await panel.locator('[data-personal-sequence] li').count(),
        3
      );
      assert.ok(
        (await panel.locator('[data-personal-sequence]').innerText()).includes(
          'audio-1_23'
        )
      );
      assert.equal(fixture.effects.length, 0);
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-music-plan]'),
        screenshots,
        'review'
      );
      fixture.mode('refused');
      // First reviewed attempt is a definite provider refusal, then a new review
      // may send the original payload. The native API never retries on its own.
      await action('run');
      await panel.locator('[data-vk-music-status=refused]').waitFor();
      assert.equal(fixture.effects.length, 1);
      fixture.mode('confirmed');
      await action('plan');
      await action('run');
      await panel.locator('[data-vk-music-status=confirmed]').waitFor();
      assert.equal(fixture.effects.length, 4);
      await action('plan');
      assert.equal(
        await panel.locator('[data-music-reason=cooldown]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-music-status]'),
        screenshots,
        'after'
      );
      // The other two actions are independently configured and retain their own
      // dormant-history windows; this recent music exchange holds them both.
      for (const kind of ['topic', 'help']) {
        const view = vkReviewedControls(page, kind);
        await view.ready();
        assert.equal(
          await view.panel
            .locator(`[data-action=vk-${kind}-enabled]`)
            .isChecked(),
          false
        );
        await view.action('plan');
        assert.equal(
          await view.panel.locator(`[data-${kind}-reason=recent]`).count(),
          1
        );
      }
      fixture.refuseWrites(true);
      await panel.locator('[data-action=vk-music-enabled]').click();
      await panel.getByRole('alert').waitFor();
      assert.equal(
        await panel.locator('[data-action=vk-music-enabled]').isChecked(),
        false
      );
      assert.deepEqual(errors, []);
      assert.equal(fixture.messages(), 0);
      return {
        orderedAudioReview: true,
        durableCooldown: true,
        independentPolicies: true,
        failedSaveRetained: true,
        syntheticCalls: fixture.effects.length,
        pageErrors: 0,
      };
    }
  );
};
