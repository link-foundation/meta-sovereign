import assert from 'node:assert/strict';
import { maintenanceServer } from '../../../experiments/issue-56/vk-maintenance-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
export const verifyVkMaintenance = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await maintenanceServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      if (before) {
        assert.equal(
          await page.locator('[data-vk-cleanup], [data-vk-outgoing]').count(),
          0
        );
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingMaintenanceControls: true,
          providerEffects: fixture.effects.length,
        };
      }
      for (const kind of ['cleanup', 'outgoing']) {
        await verifyPolicy(page, fixture, kind, screenshots);
      }
      assert.equal(fixture.messages(), 0);
      assert.deepEqual(errors, []);
      return {
        bothPolicies: true,
        protected: true,
        activeKept: true,
        limits: true,
        reviewedDeletes: true,
        uncertaintyRetained: true,
        failedSaveRetained: true,
        syntheticDeletes: fixture.effects.length,
        messages: 0,
        pageErrors: 0,
      };
    }
  );
};

const verifyPolicy = async (page, fixture, kind, screenshots) => {
  const panel = page.locator(`[data-vk-${kind}]`);
  const ready = () =>
    page.waitForFunction((name) => {
      const input = document.querySelector(`[data-action=vk-${name}-enabled]`);
      return input && !input.disabled;
    }, kind);
  await ready();
  const enabled = panel.locator(`[data-action=vk-${kind}-enabled]`);
  assert.equal(await enabled.isChecked(), false);
  await panel
    .locator(`[data-${kind}-field=priorityIds]`)
    .fill(kind === 'cleanup' ? '8' : '12');
  await panel.locator(`[data-${kind}-field=limit]`).fill('2');
  await panel.locator(`[data-action=vk-${kind}-save]`).click();
  await ready();
  await page.reload();
  await ready();
  assert.equal(
    await panel.locator(`[data-${kind}-field=priorityIds]`).inputValue(),
    kind === 'cleanup' ? '8' : '12'
  );
  const effectsBefore = fixture.effects.length;
  await panel.locator(`[data-action=vk-${kind}-plan]`).click();
  await ready();
  await panel.locator(`[data-vk-${kind}-plan=review]`).waitFor();
  assert.equal(fixture.effects.length, effectsBefore);
  assert.equal(
    await panel.locator(`[data-${kind}-reason=protected]`).count(),
    1
  );
  if (kind === 'cleanup') {
    assert.equal(
      await panel.locator('[data-cleanup-reason=active]').count(),
      1
    );
  }
  await captureVkAutomationLayouts(
    page,
    panel.locator(`[data-vk-${kind}-plan]`),
    screenshots,
    `${kind}-review`
  );
  await panel.locator(`[data-action=vk-${kind}-run]`).click();
  await ready();
  await panel.locator(`[data-vk-${kind}-status=confirmed]`).waitFor();
  assert.deepEqual(
    fixture.effects.slice(effectsBefore),
    kind === 'cleanup' ? [9, 11] : [13]
  );
  assert.equal(
    await panel.locator(`[data-action=vk-${kind}-run]`).isDisabled(),
    true
  );
  await captureVkAutomationLayouts(
    page,
    panel.locator(`[data-vk-${kind}-status]`),
    screenshots,
    `${kind}-after`
  );
  fixture.mode('unknown');
  await panel.locator(`[data-${kind}-field=priorityIds]`).fill('');
  await panel.locator(`[data-action=vk-${kind}-save]`).click();
  await ready();
  await panel.locator(`[data-action=vk-${kind}-plan]`).click();
  await ready();
  await panel.locator(`[data-action=vk-${kind}-run]`).click();
  await ready();
  await panel.locator(`[data-vk-${kind}-status=unknown]`).waitFor();
  await page.reload();
  await ready();
  await panel.locator(`[data-action=vk-${kind}-plan]`).click();
  await ready();
  assert.equal(await panel.locator(`[data-${kind}-reason=unknown]`).count(), 1);
  await captureVkAutomationLayouts(
    page,
    panel.locator(`[data-vk-${kind}-status]`),
    screenshots,
    `${kind}-unknown`
  );
  fixture.refuseWrites(true);
  await enabled.click();
  await panel.getByRole('alert').waitFor();
  assert.equal(await enabled.isChecked(), false);
  fixture.refuseWrites(false);
  fixture.mode('confirmed');
};
