import assert from 'node:assert/strict';
import { safetySettingsFixture } from '../../../experiments/issue-56/safety-settings-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
import { loadSettings } from '../../src/automation/safety.js';

const waitForSignal = async (signal) => {
  const deadline = setTimeout(
    () => signal.reject(new Error('Settings fixture signal timed out')),
    10000
  );
  try {
    return await signal.promise;
  } finally {
    clearTimeout(deadline);
  }
};

const loseAcknowledgement = async (page, lost) => {
  await page.route('**/api/automations/settings', async (route) => {
    if (route.request().method() === 'PUT') {
      try {
        await route.fetch();
        await route.abort('failed');
        lost.resolve();
      } catch (error) {
        lost.reject(error);
      }
    } else {
      await route.continue();
    }
  });
};

const verifyRefusedDraft = async (panel, source, chat, fixture) => {
  assert.equal(await source.inputValue(), 'vk');
  assert.equal(await chat.inputValue(), '777');
  assert.equal(await panel.locator('[data-optout="vk:777"]').count(), 0);
  assert.equal(await panel.locator('[data-optout="vk:201"]').count(), 1);
  assert.equal(await panel.locator('[data-safety-saved]').count(), 0);
  assert.deepEqual(
    (await loadSettings(fixture.store)).optOut.map((entry) => entry.chat),
    ['201']
  );
};

/** Save acknowledgements, failures and lost responses use the actual Lino routes. */
export const verifySafetySettings = async (browser) => {
  const fixture = await safetySettingsFixture();
  let context;
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
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
    await panel.locator('[data-optout="vk:201"]').waitFor();
    const source = panel.locator('[data-field=optout-source]');
    const chat = panel.locator('[data-field=optout-chat]');
    const add = panel.locator('[data-action=optout-add]');
    await source.fill('vk');
    await chat.fill('777');
    await panel.locator('[data-field=optout-note]').fill('Owner draft');
    fixture.refuse(true);
    await page.route('**/api/automations/settings', async (route) => {
      if (route.request().method() === 'PUT') {
        entered.resolve();
        await release.promise;
      }
      await route.continue();
    });
    await add.click();
    await waitForSignal(entered);
    assert.equal(await add.isDisabled(), true);
    assert.equal(await chat.isDisabled(), true);
    assert.equal(await panel.locator('[data-safety-saved]').count(), 0);
    release.resolve();
    await panel.getByRole('alert').waitFor();
    assert.equal(puts, 1);
    await verifyRefusedDraft(panel, source, chat, fixture);
    await captureVkAutomationLayouts(
      page,
      panel,
      process.env.SAFETY_SETTINGS_SCREENSHOTS === '1'
        ? 'docs/screenshots/issue-56-safety-settings'
        : undefined,
      'after',
      true
    );
    await page.setViewportSize({ width: 1180, height: 950 });
    await page.unroute('**/api/automations/settings');
    fixture.refuse(false);
    await add.click();
    await panel.locator('[data-optout="vk:777"]').waitFor();
    await panel.locator('[data-safety-saved]').waitFor();
    assert.equal(await chat.inputValue(), '');
    assert.equal(await panel.getByRole('alert').count(), 0);
    const lost = Promise.withResolvers();
    await loseAcknowledgement(page, lost);
    await panel
      .locator('[data-optout="vk:201"] [data-action=optout-remove]')
      .click();
    await waitForSignal(lost);
    await panel.getByRole('alert').waitFor();
    assert.equal(await panel.locator('[data-safety-saved]').count(), 0);
    assert.equal(await panel.locator('[data-optout="vk:201"]').count(), 1);
    await page.unroute('**/api/automations/settings');
    await page.reload();
    await panel.locator('[data-optout="vk:777"]').waitFor();
    assert.equal(await panel.locator('[data-optout="vk:201"]').count(), 0);
    assert.equal(puts, 3, 'recovery reads never repeat a settings mutation');
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.stats(), { sends: 0, liveProvider: false });
    const result = {
      acknowledged: 1,
      refused: 1,
      lostResponse: 1,
      puts,
      draftRetained: true,
      pendingControlsDisabled: true,
      falseSaved: 0,
      pageErrors: 0,
      sends: 0,
      liveProvider: false,
    };
    console.log('[safety-settings]', JSON.stringify(result));
    return result;
  } finally {
    release.resolve();
    await context?.close();
    await fixture.close();
  }
};
