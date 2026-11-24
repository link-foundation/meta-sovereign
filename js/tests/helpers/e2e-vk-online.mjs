import assert from 'node:assert/strict';
import { onlineServer } from '../../../experiments/issue-56/vk-online-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkOnline = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await onlineServer();
  const { context, page, errors } = await vkAutomationBrowser(
    browser,
    '🟢',
    fixture.base
  );
  context.setDefaultTimeout(10000);
  try {
    await page.goto(`${fixture.base}/#conn-vk/manual`);
    await page.getByRole('heading', { name: 'VK', exact: true }).waitFor();
    const panel = page.locator('[data-vk-online]');
    if (before) {
      assert.equal(await panel.count(), 0);
      await captureVkAutomationLayouts(
        page,
        page.getByRole('heading', { name: 'VK', exact: true }),
        screenshots,
        'before'
      );
      return {
        missingOnlineControls: true,
        providerCalls: fixture.fake.calls.length,
      };
    }
    const enabled = panel.locator('[data-action=vk-online-enabled]');
    const ready = () =>
      page.waitForFunction(() => {
        const input = document.querySelector('[data-action=vk-online-enabled]');
        return input && !input.disabled;
      });
    const status = (value) =>
      panel.locator(`[data-vk-online-status=${value}]`).waitFor();
    await ready();
    assert.equal(await enabled.isChecked(), false);
    assert.equal(fixture.fake.calls.length, 0);
    await enabled.click();
    await ready();
    assert.equal(await enabled.isChecked(), true);
    await panel.locator('[data-action=vk-online-minutes]').fill('3');
    await panel.locator('[data-action=vk-online-save]').click();
    await ready();
    await page.reload();
    await ready();
    assert.equal(await enabled.isChecked(), true);
    assert.equal(
      await panel.locator('[data-action=vk-online-minutes]').inputValue(),
      '3'
    );
    await panel.locator('[data-action=vk-online-run]').click();
    await status('confirmed');
    await captureVkAutomationLayouts(
      page,
      panel.locator('[data-vk-online-status]'),
      screenshots,
      'after'
    );
    fixture.mode('refused');
    await panel.locator('[data-action=vk-online-run]').click();
    await status('refused');
    await captureVkAutomationLayouts(
      page,
      panel.locator('[data-vk-online-status]'),
      screenshots,
      'after-refusal'
    );
    fixture.mode('unknown');
    await panel.locator('[data-action=vk-online-run]').click();
    await status('unknown');
    await page.reload();
    await ready();
    await status('unknown');
    await captureVkAutomationLayouts(
      page,
      panel.locator('[data-vk-online-status]'),
      screenshots,
      'after-unknown'
    );
    fixture.refuseWrites(true);
    await enabled.click();
    await panel.getByRole('alert').waitFor();
    assert.equal(await enabled.isChecked(), true);
    await status('unknown');
    assert.equal(fixture.fake.calls.length, 3);
    assert.equal(fixture.messages(), 0);
    assert.deepEqual(errors, []);
    return {
      savedInterval: 3,
      confirmed: true,
      refused: true,
      unknownRetained: true,
      failedSaveRetained: true,
      mockedProviderCalls: 3,
      messages: 0,
      pageErrors: 0,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
