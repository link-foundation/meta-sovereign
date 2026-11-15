import assert from 'node:assert/strict';
import {
  cancelledServer,
  cancelledAdapter,
} from '../../../experiments/issue-56/vk-cancelled-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
export const verifyVkCancelled = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await cancelledServer({
    adapter: cancelledAdapter({ ids: [9, 11, 13] }),
  });
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const { panel, ready, action } = vkReviewedControls(page, 'cancelled');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingFollowUpControls: true,
          providerEffects: fixture.effects.length,
        };
      }
      await ready();
      for (const key of ['enabled', 'blockUnanswered', 'blockUnwritable']) {
        const selector =
          key === 'enabled'
            ? '[data-action=vk-cancelled-enabled]'
            : `[data-cancelled-field=${key}]`;
        assert.equal(await panel.locator(selector).isChecked(), false);
      }
      await panel.locator('[data-cancelled-field=limit]').fill('1');
      await panel
        .locator('[data-cancelled-field=greeting]')
        .fill('Hello, friend.');
      await action('save');
      await page.reload();
      await ready();
      assert.equal(
        await panel.locator('[data-cancelled-field=greeting]').inputValue(),
        'Hello, friend.'
      );
      await action('plan');
      await panel.locator('[data-vk-cancelled-plan=review]').waitFor();
      assert.equal(fixture.effects.length, 0);
      assert.equal(
        await panel.locator('[data-cancelled-message]').innerText(),
        'Hello, friend.\nWould you like to stay in touch?'
      );
      assert.match(
        await panel.innerText(),
        /previous friendship is unverified/
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-cancelled-plan]'),
        screenshots,
        'review'
      );
      await action('run');
      await panel.locator('[data-vk-cancelled-status=confirmed]').waitFor();
      await action('plan');
      assert.equal(
        await panel.locator('[data-cancelled-reason=alreadyPrompted]').count(),
        1
      );
      fixture.canWrite.set(11, false);
      await panel.locator('[data-cancelled-field=limit]').fill('2');
      await panel.locator('[data-cancelled-field=blockUnwritable]').check();
      await action('save');
      await action('plan');
      assert.match(
        await panel.locator('[data-cancelled-id="11"]').innerText(),
        /Block unwritable/
      );
      await action('run');
      await panel.locator('[data-vk-cancelled-status=confirmed]').waitFor();
      assert.deepEqual(
        fixture.effects.map((row) => row.action),
        ['prompt', 'block']
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-cancelled-status]'),
        screenshots,
        'after'
      );
      fixture.mode('unknown');
      await panel.locator('[data-cancelled-field=limit]').fill('3');
      await action('save');
      await action('plan');
      await action('run');
      await panel.locator('[data-vk-cancelled-status=unknown]').waitFor();
      await page.reload();
      await ready();
      await action('plan');
      assert.equal(
        await panel.locator('[data-cancelled-reason=unknown]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-cancelled-status]'),
        screenshots,
        'unknown'
      );
      fixture.refuseWrites(true);
      await panel.locator('[data-action=vk-cancelled-enabled]').click();
      await panel.getByRole('alert').waitFor();
      assert.equal(
        await panel.locator('[data-action=vk-cancelled-enabled]').isChecked(),
        false
      );
      assert.equal(fixture.effects.length, 3);
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        honestEvidence: true,
        reviewedMessage: true,
        savedText: true,
        noRepeat: true,
        separateBlockingConsent: true,
        unknownRetained: true,
        failedSaveRetained: true,
        syntheticPromptCalls: 2,
        syntheticBlockCalls: 1,
        pageErrors: 0,
      };
    }
  );
};
