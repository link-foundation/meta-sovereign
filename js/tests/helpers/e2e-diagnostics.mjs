import assert from 'node:assert/strict';
import { diagnosticServer } from '../../../experiments/issue-56/diagnostics-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyDiagnostics = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await diagnosticServer();
  let context;
  try {
    await fetch(`${fixture.base}/synthetic-activity`);
    const view = await vkAutomationBrowser(browser, '📋', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    const { page, errors } = view;
    page.on('pageerror', (error) =>
      console.error('diagnostics-page-error', error)
    );
    let reads = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/diagnostics/logs')) {
        reads++;
      }
    });
    await page.addInitScript(() => {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value) => {
            if (globalThis.fixtureCopyDenied) {
              throw new Error('synthetic clipboard refusal');
            }
            globalThis.fixtureClipboard = value;
          },
        },
      });
    });
    await page.goto(`${fixture.base}/#settings`);
    const panel = page.locator('.diagnostics-settings');
    await page.locator('.settings-view').waitFor();
    if (before) {
      assert.equal(await panel.count(), 0);
      await captureVkAutomationLayouts(
        page,
        page.getByRole('heading', { name: 'Settings', exact: true }),
        screenshots,
        'before'
      );
      return { missingDiagnostics: true, liveProvider: false };
    }
    await panel.waitFor();
    assert.equal(reads, 0, 'collapsed logs do not poll');
    const disclosure = panel.locator('[data-action=diagnostics-open]');
    await disclosure.click();
    const output = panel.locator('pre');
    await output.getByText('/synthetic-activity', { exact: false }).waitFor();
    assert.ok(reads > 0);
    await panel.locator('[data-action=diagnostics-copy]').click();
    await panel.getByText('Visible log copied.', { exact: true }).waitFor();
    assert.match(
      await page.evaluate(() => globalThis.fixtureClipboard),
      /synthetic-activity/
    );
    await captureVkAutomationLayouts(page, panel, screenshots, 'after');
    await page.evaluate(() => {
      globalThis.fixtureCopyDenied = true;
    });
    await panel.locator('[data-action=diagnostics-copy]').click();
    await panel
      .getByText(
        'Could not copy. Select the visible text to copy it manually.',
        { exact: true }
      )
      .waitFor();
    await captureVkAutomationLayouts(page, panel, screenshots, 'copy-refused');
    // Fail one owned read, retaining the already visible log, then recover.
    let failed = false;
    await page.route('**/api/diagnostics/logs?*', (route) => {
      if (!failed) {
        failed = true;
        return route.fulfill({ status: 503, body: 'synthetic unavailable' });
      }
      return route.continue();
    });
    await panel
      .getByText(
        'Server diagnostics are unavailable. Retained entries stay visible; reconnection is automatic.',
        { exact: true }
      )
      .waitFor();
    assert.match(await output.textContent(), /synthetic-activity/);
    await panel
      .getByText('Receiving server activity.', { exact: true })
      .waitFor();
    await disclosure.click();
    await panel
      .locator('[data-diagnostic-logs]')
      .waitFor({ state: 'detached' });
    const closedReads = reads;
    await page.waitForTimeout(2200);
    assert.equal(reads, closedReads, 'closing disposes the read timer');
    assert.deepEqual(errors, []);
    return {
      liveLogs: true,
      copyAcknowledged: true,
      copyRefusalVisible: true,
      recoveryRetainsEntries: true,
      closedDoesNotPoll: true,
      pageErrors: 0,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
