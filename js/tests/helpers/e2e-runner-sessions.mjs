import assert from 'node:assert/strict';
import { runnerApiFixture } from '../../../experiments/issue-56/runner-api-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyRunnerSessions = async (
  browser,
  { screenshots, beforeBundle } = {}
) => {
  const fixture = await runnerApiFixture();
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    const { page, errors } = view;
    if (beforeBundle) {
      await page.route('**/app.min.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: beforeBundle })
      );
    }
    await page.goto(`${fixture.base}/#settings`);
    const panel = page.locator('[data-runner-settings]');
    await panel.waitFor();
    assert.deepEqual(
      fixture.backend.calls,
      [],
      'collapsed controls perform no probes'
    );
    const disclosure = panel.locator('[data-runner-open]');
    await disclosure.click();
    const mode = (name) => panel.locator(`[data-runner-mode=${name}]`);
    const action = (name, command) =>
      mode(name).locator(`[data-runner-action=${command}]`);
    const observed = (name, state) =>
      mode(name).locator(`[data-runner-state=${state}]`).waitFor();
    await observed('local', 'stopped');
    await observed('server', 'stopped');
    assert.ok(
      fixture.backend.calls.every(([, command]) => command === 'probe')
    );
    for (const target of ['local', 'server', 'local']) {
      await action(target, 'start').click();
      await observed(target, 'running');
      await observed(target === 'local' ? 'server' : 'local', 'stopped');
    }
    await captureVkAutomationLayouts(
      page,
      panel,
      screenshots,
      'issue-56-runner-after',
      true
    );
    const mutations = fixture.backend.calls.filter(
      ([, command]) => command !== 'probe'
    );
    let refused = false;
    await page.route('**/api/runner/stop', (route) => {
      refused = true;
      return route.abort();
    });
    await action('local', 'stop').click();
    await panel.getByRole('alert').waitFor();
    assert.equal(refused, true);
    assert.equal(await action('local', 'start').isDisabled(), true);
    assert.equal(await action('local', 'stop').isDisabled(), true);
    await captureVkAutomationLayouts(
      page,
      panel,
      screenshots,
      'issue-56-runner-uncertain',
      true
    );
    await panel.locator('[data-runner-action=refresh]').click();
    await panel.getByRole('alert').waitFor({ state: 'detached' });
    await observed('local', 'running');
    assert.deepEqual(
      fixture.backend.calls.filter(([, command]) => command !== 'probe'),
      mutations
    );
    await page.unroute('**/api/runner/stop');
    await action('local', 'stop').click();
    await observed('local', 'stopped');
    fixture.backend.state.server = 'unknown';
    await panel.locator('[data-runner-action=refresh]').click();
    await observed('server', 'unknown');
    assert.equal(await action('local', 'start').isDisabled(), true);
    await captureVkAutomationLayouts(
      page,
      panel,
      screenshots,
      'issue-56-runner-unknown',
      true
    );
    await disclosure.click();
    await panel
      .locator('[data-runner-mode]')
      .first()
      .waitFor({ state: 'detached' });
    const reads = fixture.backend.calls.length;
    await page.waitForTimeout(100);
    assert.equal(fixture.backend.calls.length, reads);
    assert.deepEqual(errors, []);
    return {
      stoppedDefaults: true,
      bothSwitchDirections: true,
      unknownStateBlocksSwitch: true,
      ambiguousActionNotReplayed: true,
      collapsedDoesNotProbe: true,
      desktopAndPhoneFit: true,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
