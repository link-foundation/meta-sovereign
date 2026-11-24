import assert from 'node:assert/strict';
import { diagnosticServer } from '../../../experiments/issue-56/diagnostics-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyDesktopClipboard = async (
  browser,
  { before = false, beforeBundle, screenshots } = {}
) => {
  const fixture = await diagnosticServer();
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '📋', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    const { page, errors } = view;
    if (beforeBundle) {
      await page.route('**/app.min.js', (route) =>
        route.fulfill({
          contentType: 'application/javascript',
          body: beforeBundle,
        })
      );
    }
    await page.addInitScript(() => {
      globalThis.fixtureClipboardWrites = 0;
      globalThis.fixtureBrowserWrites = 0;
      globalThis.metaSovereignShell = {
        platform: 'electron',
        discoveryCandidates: [],
        copyText: async (text) => {
          globalThis.fixtureClipboardWrites++;
          if (globalThis.fixtureCopyDenied) {
            return { ok: false };
          }
          globalThis.fixtureClipboard = text;
          globalThis.fixtureExactVisible =
            text === document.querySelector('.diagnostic-log-text').textContent;
          return { ok: true };
        },
      };
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            globalThis.fixtureBrowserWrites++;
            throw new Error('browser clipboard deliberately unavailable');
          },
        },
      });
    });
    await page.goto(`${fixture.base}/#settings`);
    await fetch(`${fixture.base}/synthetic-activity`);
    const panel = page.locator('.diagnostics-settings');
    await panel.locator('[data-action=diagnostics-open]').click();
    await panel
      .locator('pre')
      .getByText('/synthetic-activity', { exact: false })
      .waitFor();
    await panel.locator('[data-action=diagnostics-copy]').click();
    const refused =
      'Could not copy. Select the visible text to copy it manually.';
    if (before) {
      await panel.getByText(refused, { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => globalThis.fixtureClipboardWrites),
        0
      );
      await captureVkAutomationLayouts(
        page,
        panel,
        screenshots,
        'before',
        true
      );
      return { missingDesktopBridge: true, liveProvider: false };
    }
    await panel.getByText('Visible log copied.', { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => globalThis.fixtureExactVisible),
      true
    );
    assert.match(
      await page.evaluate(() => globalThis.fixtureClipboard),
      /synthetic-activity/u
    );
    assert.equal(
      await page.evaluate(() => globalThis.fixtureClipboardWrites),
      1
    );
    assert.equal(await page.evaluate(() => globalThis.fixtureBrowserWrites), 0);
    await captureVkAutomationLayouts(page, panel, screenshots, 'after', true);
    await page.evaluate(() => {
      globalThis.fixtureCopyDenied = true;
    });
    await panel.locator('[data-action=diagnostics-copy]').click();
    await panel.getByText(refused, { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => globalThis.fixtureClipboardWrites),
      2
    );
    assert.equal(await page.evaluate(() => globalThis.fixtureBrowserWrites), 0);
    await captureVkAutomationLayouts(page, panel, screenshots, 'refused', true);
    assert.deepEqual(errors, []);
    return {
      copiedVisibleText: true,
      nativeReceiptRequired: true,
      browserPermissionIndependent: true,
      noSilentFallback: true,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
