import assert from 'node:assert/strict';
import { runnerApiFixture } from '../../../experiments/issue-56/runner-api-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyRunnerHealth = async (
  browser,
  { screenshots, beforeBundle } = {}
) => {
  const fixture = await runnerApiFixture({ initial: { local: 'running' } });
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    const { page, errors } = view;
    let reads = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/runner/inspect?')) {
        reads++;
      }
    });
    if (beforeBundle) {
      await page.route('**/app.min.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: beforeBundle })
      );
    }
    await page.goto(`${fixture.base}/#settings`);
    const panel = page.locator('[data-runner-settings]');
    await panel.locator('[data-runner-open]').click();
    const local = panel.locator('[data-runner-mode=local]');
    await local.locator('[data-runner-state=running]').waitFor();
    assert.equal(reads, 0, 'opening controls must not check health');
    assert.equal(await local.locator('[data-runner-health]').count(), 0);
    if (beforeBundle) {
      await captureVkAutomationLayouts(
        page,
        panel,
        screenshots,
        'issue-56-runner-health-before',
        true
      );
    }
    for (const state of ['ready', 'locked', 'degraded', 'unknown']) {
      fixture.backend.health.local = state;
      await local.locator('[data-runner-action=inspect]').click();
      await local.locator(`[data-runner-health=${state}]`).waitFor();
      assert.equal(
        await local.locator('[data-runner-state=running]').count(),
        1
      );
      assert.equal(await local.locator('time[datetime]').count(), 1);
      await captureVkAutomationLayouts(
        page,
        panel,
        screenshots,
        `issue-56-runner-health-${state}`,
        true
      );
    }
    const count = reads;
    await panel
      .locator('[data-runner-mode=server] [data-runner-action=inspect]')
      .click();
    await panel
      .locator('[data-runner-mode=server] [data-runner-health=stopped]')
      .waitFor();
    assert.equal(reads, count + 1);
    await panel.locator('[data-runner-open]').click();
    const closedReads = reads;
    await page.waitForTimeout(100);
    assert.equal(reads, closedReads);
    assert.ok(
      fixture.backend.calls.every(([, action]) =>
        ['probe', 'health'].includes(action)
      ),
      'inspection never starts or stops a session'
    );
    assert.equal(
      fixture.backend.calls.filter(([, action]) => action === 'health').length,
      4,
      'stopped sessions must not execute health'
    );
    assert.deepEqual(errors, []);
    return {
      explicitHealthReads: 5,
      separateSessionState: true,
      readyLockedDegradedUnknown: true,
      stoppedSkipsHealth: true,
      noProcessMutation: true,
      closedControlsDoNotRead: true,
      desktopAndPhoneFit: true,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
