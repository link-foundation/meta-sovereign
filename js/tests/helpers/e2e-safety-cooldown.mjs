import assert from 'node:assert/strict';
import {
  safetySettingsFixture,
  protectedSettings,
} from '../../../experiments/issue-56/safety-settings-fixture.mjs';
import { loadSettings } from '../../src/automation/safety.js';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

/** Actual default-Lino persistence for the shared UI's optional cooldown. */
export const verifySafetyCooldown = async (browser) => {
  const fixture = await safetySettingsFixture();
  let context;
  try {
    const view = await vkAutomationBrowser(browser, '', fixture.base);
    context = view.context;
    context.setDefaultTimeout(10000);
    const { page, errors } = view;
    let puts = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'PUT' &&
        request.url().endsWith('/api/automations/settings')
      ) {
        puts++;
      }
    });
    await page.goto(`${fixture.base}/#/automation`);
    const panel = page.locator('.automation-optout');
    const input = panel.locator('[data-field=safety-cooldown]');
    const save = panel.locator('[data-action=quiet-save]');
    await input.waitFor();
    assert.equal(await input.inputValue(), '7');
    await input.fill('-1');
    assert.equal(await save.isDisabled(), true);
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.match(
      await panel.getByRole('alert').innerText(),
      /zero or more days/u
    );
    assert.equal(puts, 0);
    await input.fill('5.5');
    await save.click();
    await panel.locator('[data-safety-saved]').waitFor();
    assert.deepEqual(await loadSettings(fixture.store), {
      ...protectedSettings,
      cooldownDays: 5.5,
    });
    await page.reload();
    await input.waitFor();
    assert.equal(await input.inputValue(), '5.5');
    await captureVkAutomationLayouts(
      page,
      input.locator('..'),
      process.env.SAFETY_COOLDOWN_SCREENSHOTS === '1'
        ? 'docs/screenshots/issue-56-safety-cooldown'
        : undefined,
      'after',
      true
    );
    await input.fill('');
    await save.click();
    await panel.locator('[data-safety-saved]').waitFor();
    assert.deepEqual(await loadSettings(fixture.store), {
      ...protectedSettings,
      cooldownDays: null,
    });
    await page.reload();
    await input.waitFor();
    assert.equal(await input.inputValue(), '');
    assert.equal(puts, 2);
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.stats(), { sends: 0, liveProvider: false });
    return {
      saved: 5.5,
      reset: null,
      invalidWrites: 0,
      puts,
      reloads: 2,
      retainedSafeguards: true,
      pageErrors: 0,
      sends: 0,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
