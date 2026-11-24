import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runnerLogServer } from '../../../experiments/issue-56/runner-log-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyRunnerLog = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await runnerLogServer();
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '📋', fixture.base);
    context = view.context;
    const { page, errors } = view;
    context.setDefaultTimeout(10000);
    await page.goto(`${fixture.base}/#settings`);
    const panel = page.locator('.diagnostics-settings');
    await panel.locator('[data-action=diagnostics-open]').click();
    const configuration = panel.locator('[data-diagnostic-configuration]');
    if (before) {
      assert.equal(await configuration.count(), 0);
      await captureVkAutomationLayouts(page, panel, screenshots, 'before');
      return { missingSessionControls: true, liveProvider: false };
    }
    const checkbox = configuration.locator('[data-action=diagnostics-verbose]');
    await checkbox.waitFor();
    await configuration
      .locator('[data-diagnostic-session=persisted]')
      .waitFor();
    assert.equal(await checkbox.isChecked(), true);
    await checkbox.uncheck();
    const save = configuration.locator('[data-action=diagnostics-save]');
    await save.click();
    await configuration
      .locator('[data-diagnostic-configuration-state=settingsSaved]')
      .waitFor();
    const waiting = page.waitForEvent('download');
    await configuration.locator('[data-action=diagnostics-download]').click();
    const file = await waiting;
    const text = await readFile(await file.path(), 'utf8');
    assert.match(text, /runner_session_started/);
    assert.match(text, /diagnostics_settings_saved/);
    assert.match(file.suggestedFilename(), /\.log$/);
    await captureVkAutomationLayouts(page, configuration, screenshots, 'after');
    await page.reload();
    await panel.locator('[data-action=diagnostics-open]').click();
    await configuration
      .locator('[data-diagnostic-session=persisted]')
      .waitFor();
    assert.equal(await checkbox.isChecked(), false);
    await checkbox.check();
    await page.route('**/api/diagnostics/settings', (route) =>
      route.request().method() === 'POST'
        ? route.abort('failed')
        : route.continue()
    );
    await save.click();
    await configuration
      .locator('[data-diagnostic-configuration-state=settingsFailed]')
      .waitFor();
    assert.equal(
      await checkbox.isChecked(),
      true,
      'an unconfirmed save retains the owner draft'
    );
    await captureVkAutomationLayouts(
      page,
      configuration,
      screenshots,
      'save-unconfirmed'
    );
    await page.unroute('**/api/diagnostics/settings');
    await configuration.locator('[data-action=diagnostics-reload]').click();
    await configuration
      .locator('[data-diagnostic-session=persisted]')
      .waitFor();
    await page.waitForFunction(
      () =>
        !globalThis.document.querySelector('[data-action=diagnostics-verbose]')
          .checked
    );
    await panel.locator('[data-action=diagnostics-open]').click();
    await configuration.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    return {
      acknowledgedPreference: true,
      retainedAfterReload: true,
      downloadedFullSession: true,
      failedSaveRetainsDraft: true,
      reloadRecoversAcknowledgedPreference: true,
      collapsedOwnerDisposed: true,
      desktopAndPhoneFit: true,
      pageErrors: errors.length,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
