import assert from 'node:assert/strict';
import { runnerApiFixture } from '../../../experiments/issue-56/runner-api-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

const checkPlacement = async (feedback) => {
  const position = await feedback.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      fixed: globalThis.getComputedStyle(element).position === 'fixed',
      top: box.top,
      bottom: box.bottom,
      center: box.left + box.width / 2,
      textFits: [...element.querySelectorAll('p')].every(
        (paragraph) => paragraph.scrollWidth <= paragraph.clientWidth
      ),
      viewport: {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      },
    };
  });
  assert.equal(position.fixed, true);
  assert.equal(position.textFits, true);
  assert.ok(position.top >= 0 && position.top < 40);
  assert.ok(position.bottom < position.viewport.height);
  assert.ok(Math.abs(position.center - position.viewport.width / 2) < 2);
};

const checkDismissal = async (page, feedback, start, stop) => {
  await feedback.locator('[data-runner-feedback-dismiss]').click();
  assert.equal(await feedback.count(), 0);
  await page.locator('[data-runner-action=refresh]').click();
  await start.waitFor({ state: 'visible' });
  assert.equal(await feedback.count(), 0, 'refresh must not replay dismissal');
  await stop.click();
  await page.locator('[data-runner-feedback=local-stop]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await feedback.count(), 0);
  await page.clock.install();
  await start.click();
  await feedback.waitFor();
  await page.clock.fastForward(8100);
  await feedback.waitFor({ state: 'detached' });
};

const checkUnconfirmed = async (page, feedback, stop) => {
  await page.route('**/api/runner/stop', (route) => route.abort());
  await stop.click();
  await page.locator('[data-runner-settings] [role=alert]').waitFor();
  assert.equal(await feedback.count(), 0, 'lost action is not success');
  await page.locator('[data-runner-action=refresh]').click();
  await page
    .locator('[data-runner-settings] [role=alert]')
    .waitFor({ state: 'detached' });
  assert.equal(await feedback.count(), 0, 'recovery is not action success');
  await page.unroute('**/api/runner/stop');
};

/** The same shared confirmation contract on the connected web/desktop surface. */
export const verifyRunnerFeedback = async (
  browser,
  { screenshots, beforeBundle } = {}
) => {
  const fixture = await runnerApiFixture();
  let context;
  let release;
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
    await panel.locator('[data-runner-open]').click();
    await panel.locator('[data-runner-state=stopped]').first().waitFor();
    const feedback = page.locator('[data-runner-feedback]');
    const local = panel.locator('[data-runner-mode=local]');
    const start = local.locator('[data-runner-action=start]');
    const stop = local.locator('[data-runner-action=stop]');
    assert.equal(await feedback.count(), 0);
    let entered;
    const held = new Promise((resolve) => {
      entered = resolve;
    });
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/api/runner/start', async (route) => {
      entered();
      await gate;
      await route.continue();
    });
    await start.click();
    await held;
    assert.equal(await feedback.count(), 0, 'pending is not confirmation');
    assert.equal(await stop.isDisabled(), true);
    await panel.locator('[data-runner-open]').focus();
    const focused = await page.evaluateHandle(() => document.activeElement);
    release();
    await local.locator('[data-runner-state=running]').waitFor();
    assert.equal(
      await focused.evaluate((element) => element === document.activeElement),
      true,
      'the confirmation must not move focus from the disclosure'
    );
    await captureVkAutomationLayouts(
      page,
      panel,
      screenshots,
      `issue-56-runner-feedback-${beforeBundle ? 'before' : 'after'}`,
      true
    );
    await feedback.waitFor();
    assert.equal(await feedback.getAttribute('role'), 'status');
    assert.equal(await feedback.getAttribute('aria-live'), 'polite');
    assert.match(
      await feedback.innerText(),
      /Local session: Session observed running/
    );
    assert.match(await feedback.innerText(), /readiness is checked separately/);
    await checkPlacement(feedback);
    await checkDismissal(page, feedback, start, stop);
    await checkUnconfirmed(page, feedback, stop);
    await panel.locator('[data-runner-open]').click();
    await panel
      .locator('[data-runner-mode]')
      .first()
      .waitFor({ state: 'detached' });
    assert.equal(await feedback.count(), 0);
    assert.deepEqual(errors, []);
    return {
      receiptOnlyFeedback: true,
      pendingAndAmbiguousSilent: true,
      recoveredStatusSilent: true,
      dismissedFeedbackNotReplayed: true,
      escapeAndExpiry: true,
      focusPreserved: true,
      topCenterDesktopAndPhone: true,
      pageErrors: errors.length,
      liveProvider: false,
    };
  } finally {
    release?.();
    await context?.close();
    await fixture.close();
  }
};
