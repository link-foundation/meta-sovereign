import assert from 'node:assert/strict';
import { queueServer } from '../../../experiments/issue-56/vk-queue-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
import { decoded } from './e2e-form-review.mjs';

export const verifyVkSendQueue = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await queueServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const panel = page.locator('[data-vk-send-queue]');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return { missingQueueControls: true, liveProvider: false };
      }
      const ready = () =>
        page.waitForFunction(() => {
          const input = document.querySelector(
            '[data-action=vk-queue-enabled]'
          );
          return input && !input.disabled;
        });
      await ready();
      const enabled = panel.locator('[data-action=vk-queue-enabled]');
      assert.equal(await enabled.isChecked(), false);
      const save = async (change, ok = true) => {
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith('/api/vk/send-queue') &&
            r.request().method() === 'POST'
        );
        await change();
        assert.equal((await decoded(await response)).ok, ok);
        await ready();
      };
      await save(() => enabled.click());
      const speed = panel.locator('[data-action=vk-queue-speed]');
      await speed.fill('600');
      await save(() =>
        panel.getByRole('button', { name: 'Save speed', exact: true }).click()
      );
      await page.reload();
      await ready();
      assert.equal(await enabled.isChecked(), true);
      assert.equal(await speed.inputValue(), '600');
      assert.equal(
        fixture.calls.length,
        0,
        'settings and reload never issue provider calls'
      );
      fixture.refuseWrites(true);
      await save(() => enabled.click(), false);
      await panel.getByRole('alert').waitFor();
      assert.equal(
        await enabled.isChecked(),
        true,
        'retain acknowledged settings'
      );
      await captureVkAutomationLayouts(
        page,
        panel.getByRole('alert'),
        screenshots,
        'retained'
      );
      fixture.refuseWrites(false);
      await fixture.submit('browser-text');
      await fixture.submit('browser-sticker', {
        source: 'vk',
        chat: '8',
        sticker: { id: '101' },
      });
      await fixture.store.put({
        id: 'automation-peer-state:browser-fixture',
        source: 'vk',
        chat: '7',
        automation: 'automation:fixture',
        lastTriggered: new Date(fixture.now()).toISOString(),
        drafts: 1,
      });
      await panel.locator('[data-action=vk-queue-refresh]').click();
      await ready();
      await panel.locator('details').evaluateAll((nodes) =>
        nodes.forEach((node) => {
          node.open = true;
        })
      );
      assert.equal(await panel.locator('[data-vk-queue-receipt]').count(), 2);
      await panel
        .getByText('Delivery: Sent', { exact: true })
        .first()
        .waitFor();
      await panel
        .getByText('Read receipt: Confirmed', { exact: true })
        .first()
        .waitFor();
      await panel.getByText('Drafts queued: 1', { exact: false }).waitFor();
      const calls = fixture.calls.length;
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-vk-queue-receipt]').first(),
        screenshots,
        'after'
      );
      await page.reload();
      await ready();
      assert.equal(
        fixture.calls.length,
        calls,
        'inspection never resumes delivered work'
      );
      assert.equal(fixture.stats().messages, 2);
      assert.deepEqual(errors, []);
      return {
        retainedAcknowledgedSettings: true,
        separateDeliveryAndProgress: true,
        peerDraftCount: 1,
        syntheticMessages: 2,
        reloadDoesNotReplay: true,
        pageErrors: 0,
        liveProvider: false,
      };
    }
  );
};
