import assert from 'node:assert/strict';
import { wallPolicy } from '../../src/automation/vk-wall-settings.js';
import {
  wallAdapter,
  wallServer,
} from '../../../experiments/issue-56/vk-wall-fixture.mjs';
import {
  reviewVkConnection,
  vkReviewedControls,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

const prepareWallMedia = async (page, { panel, ready, action }) => {
  const random = panel.locator('[data-wall-field=randomAttachment]');
  assert.equal(await random.isChecked(), false);
  assert.equal(
    await panel.locator('[data-action=vk-wall-enabled]').isChecked(),
    false
  );
  assert.equal(
    await panel.locator('[data-wall-field=replaceOwned]').isChecked(),
    false
  );
  for (const [key, value] of [
    ['communities', '42'],
    ['messages', 'Add me as a friend: owner invitation'],
    ['attachments', 'audio-1_23,audio-1_24'],
  ]) {
    await panel.locator(`[data-wall-field=${key}]`).fill(value);
  }
  await panel.locator('[data-wall-field=replaceOwned]').check();
  await random.check();
  await action('save');
  await page.reload();
  await ready();
  assert.equal(await random.isChecked(), true);
  assert.equal(
    await panel.locator('[data-wall-field=communities]').inputValue(),
    '42'
  );
  assert.equal(
    await panel.locator('[data-wall-field=replaceOwned]').isChecked(),
    true
  );
  await action('plan');
};

export const verifyVkWall = async (
  browser,
  { before = false, beforeMedia = false, screenshots } = {}
) => {
  let refuseDelete = true;
  const fixture = await wallServer({
    adapter: wallAdapter({
      communities: [42, 43],
      response: (step) =>
        step.action === 'delete' && refuseDelete ? 'refused' : undefined,
    }),
  });
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const { panel, ready, action } = vkReviewedControls(page, 'wall');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingWallControls: true,
          providerEffects: fixture.effects.length,
        };
      }
      await ready();
      const random = panel.locator('[data-wall-field=randomAttachment]');
      if (beforeMedia) {
        assert.equal(await random.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingRandomMedia: true,
          providerEffects: fixture.effects.length,
        };
      }
      await prepareWallMedia(page, { panel, ready, action });
      const selected = (await wallPolicy.read(fixture.store)).plan.items[0]
        .attachments;
      assert.equal(selected.length, 1);
      assert(['audio-1_23', 'audio-1_24'].includes(selected[0]));
      assert.equal(
        await panel.locator('[data-wall-reason=eligible]').count(),
        1
      );
      assert.equal(
        await panel.locator('[data-wall-message]').innerText(),
        'Add me as a friend: owner invitation'
      );
      assert.ok(
        (await panel.locator('[data-vk-wall-plan]').innerText()).includes(
          selected[0]
        )
      );
      assert.equal(fixture.effects.length, 0);
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-wall-plan]'),
        screenshots,
        'review'
      );
      await action('run');
      await panel.locator('[data-vk-wall-status=refused]').waitFor();
      assert.equal(fixture.effects[0].attachments, selected[0]);
      assert.deepEqual(
        fixture.effects.map((s) => s.action),
        ['post', 'delete']
      );
      await action('plan');
      assert.deepEqual(
        (await wallPolicy.read(fixture.store)).plan.items[0].attachments,
        selected
      );
      assert.equal(await panel.locator('[data-wall-post-receipt]').count(), 1);
      assert.equal(
        await panel.locator('[data-wall-reason=eligible]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-wall-plan]'),
        screenshots,
        'partial'
      );
      refuseDelete = false;
      await action('run');
      await panel.locator('[data-vk-wall-status=confirmed]').waitFor();
      assert.deepEqual(
        fixture.effects.map((s) => s.action),
        ['post', 'delete', 'delete']
      );
      await action('plan');
      assert.equal(
        await panel.locator('[data-wall-reason=visible]').count(),
        1
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-wall-plan]'),
        screenshots,
        'after'
      );
      await panel.locator('[data-wall-field=communities]').fill('43');
      await action('save');
      await action('plan');
      fixture.mode('unknown');
      await action('run');
      await panel.locator('[data-vk-wall-status=unknown]').waitFor();
      assert.equal(fixture.effects.length, 4);
      fixture.mode('confirmed');
      await action('plan');
      assert.equal(
        await panel.locator('[data-wall-reason=unknown]').count(),
        1
      );
      await action('run');
      assert.equal(fixture.effects.length, 4);
      fixture.refuseWrites(true);
      await panel.locator('[data-action=vk-wall-enabled]').click();
      await panel.getByRole('alert').waitFor();
      assert.equal(
        await panel.locator('[data-action=vk-wall-enabled]').isChecked(),
        false
      );
      assert.deepEqual(errors, []);
      assert.equal(fixture.messages(), 0);
      return {
        savedWallPolicy: true,
        exactNativeReview: true,
        postBeforeDelete: true,
        partialWithoutRepost: true,
        visibleDeduplication: true,
        unknownRetained: true,
        failedSaveRetained: true,
        frozenSingleMedia: true,
        syntheticCalls: fixture.effects.length,
        pageErrors: 0,
      };
    }
  );
};
