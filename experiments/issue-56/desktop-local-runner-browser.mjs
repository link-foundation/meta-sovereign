import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  captureVkAutomationLayouts,
  vkAutomationBrowser,
} from '../../js/tests/helpers/vk-automation-browser.mjs';

const screenshotDir = resolve('docs/screenshots/issue-56-desktop-local-runner');
const capture = (page, panel, result) =>
  captureVkAutomationLayouts(page, panel, screenshotDir, result, true);

const verify = async (browser, fixture, before) => {
  const { context, page, errors } = await vkAutomationBrowser(
    browser,
    '',
    fixture.origin
  );
  context.setDefaultTimeout(20000);
  try {
    await page.goto(`${fixture.origin}/#settings`);
    const panel = page.locator('[data-runner-settings]');
    const local = panel.locator('[data-runner-mode=local]');
    await panel.locator('[data-runner-open]').click();
    await local.locator('[data-runner-state=unconfigured]').waitFor();
    await panel.locator('[data-runner-profile-open]').click();
    const editor = panel.locator('[data-runner-profile-editor]');
    const document = editor.locator('[data-runner-profile-document]');
    await document.fill(fixture.document);
    const receipt = page.waitForResponse(/\/api\/runner\/configure$/);
    await editor.locator('[data-runner-profile-save]').click();
    const configureStatus = (await receipt).status();
    if (before) {
      assert.equal(configureStatus, 400);
      await editor.getByRole('alert').waitFor();
      assert.equal(await document.inputValue(), fixture.document);
      await capture(page, editor, 'before');
      assert.deepEqual(errors, []);
      return { configureStatus, draftRetained: true, liveProvider: false };
    }
    assert.equal(configureStatus, 200);
    await editor.locator('[data-runner-profile-saved]').waitFor();
    await capture(page, editor, 'saved');
    await panel.locator('[data-runner-profile-open]').click();
    await panel.locator('[data-runner-action=refresh]').click();
    await local.locator('[data-runner-state=stopped]').waitFor();
    await local.locator('[data-runner-action=start]').click();
    await local.locator('[data-runner-state=running]').waitFor();
    const response = await fetch(`${fixture.workerOrigin}/api/health`, {
      signal: globalThis.AbortSignal.timeout(5000),
    });
    assert.equal(response.ok, true);
    await response.body?.cancel();
    await local.locator('[data-runner-action=inspect]').click();
    await local.locator('[data-runner-health=ready]').waitFor();
    await capture(page, panel, 'after');
    await local.locator('[data-runner-action=stop]').click();
    await local.locator('[data-runner-state=stopped]').waitFor();
    await assert.rejects(
      fetch(`${fixture.workerOrigin}/api/health`, {
        signal: globalThis.AbortSignal.timeout(2500),
      })
    );
    assert.deepEqual(errors, []);
    return {
      configureStatus,
      saved: true,
      applicationReady: true,
      listenerClosed: true,
      liveProvider: false,
    };
  } finally {
    await context.close();
  }
};

const [log, mode] = process.argv.slice(2);
const ready = (await readFile(log, 'utf8'))
  .split('\n')
  .find((line) => line.startsWith('{"origin":'));
assert(ready, 'The private Electron fixture must provide a readiness receipt.');
await runBrowserScenarios('desktop-local-runner', [
  (browser) => verify(browser, JSON.parse(ready), mode === '--before'),
]);
