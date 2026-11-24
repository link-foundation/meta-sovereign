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

/** Chat and person IDs remain distinct through actual acknowledged Lino writes. */
export const verifySafetyOptOutPerson = async (browser) => {
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
    const kind = panel.locator('[data-field=optout-kind]');
    const add = panel.locator('[data-action=optout-add]');
    const row = (target) =>
      panel.locator(`[data-optout="vk:201"][data-optout-kind=${target}]`);
    await kind.selectOption('contact');
    await panel.locator('[data-field=optout-source]').fill('vk');
    const contact = panel.locator('[data-field=optout-contact]');
    await contact.fill('201');
    await panel.locator('[data-field=optout-note]').fill('Person across chats');
    await kind.selectOption('chat');
    await panel.locator('[data-field=optout-chat]').fill('777');
    await kind.selectOption('contact');
    assert.equal(await contact.inputValue(), '201');
    fixture.refuse(true);
    await add.click();
    await panel.getByRole('alert').waitFor();
    assert.equal(puts, 1);
    assert.equal(await kind.inputValue(), 'contact');
    assert.equal(await contact.inputValue(), '201');
    assert.equal(
      await panel.locator('[data-field=optout-note]').inputValue(),
      'Person across chats'
    );
    assert.equal(await panel.locator('[data-safety-saved]').count(), 0);
    assert.equal(await row('contact').count(), 0);
    assert.deepEqual(await loadSettings(fixture.store), protectedSettings);
    fixture.refuse(false);
    await add.click();
    await Promise.all([
      row('contact').waitFor(),
      panel.locator('[data-safety-saved]').waitFor(),
    ]);
    const saved = await loadSettings(fixture.store);
    assert.deepEqual(saved.optOut[0], protectedSettings.optOut[0]);
    assert.deepEqual(saved.optOut[1], {
      source: 'vk',
      contact: '201',
      note: 'Person across chats',
      at: saved.optOut[1].at,
    });
    assert.equal(Number.isFinite(Date.parse(saved.optOut[1].at)), true);
    assert.equal(await contact.inputValue(), '');
    await page.reload();
    await row('contact').waitFor();
    assert.equal(await row('chat').count(), 1);
    assert.match(await row('chat').innerText(), /Chat vk:201/u);
    assert.match(await row('contact').innerText(), /Person vk:201/u);
    await kind.selectOption('contact');
    await captureVkAutomationLayouts(
      page,
      panel.locator('.optout-list'),
      process.env.SAFETY_PERSON_SCREENSHOTS === '1'
        ? 'docs/screenshots/issue-56-safety-person'
        : undefined,
      'after',
      true
    );
    await row('contact').locator('[data-action=optout-remove]').click();
    await page.waitForFunction(
      () => !document.querySelector('[data-optout-kind=contact]')
    );
    await page.reload();
    await row('chat').waitFor();
    assert.equal(await row('contact').count(), 0);
    assert.deepEqual(await loadSettings(fixture.store), protectedSettings);
    assert.equal(puts, 3);
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.stats(), { sends: 0, liveProvider: false });
    return {
      acknowledged: 2,
      refused: 1,
      puts,
      reloads: 2,
      scopes: ['chat', 'contact'],
      sameIdentifier: '201',
      refusedDraftRetained: true,
      preciseRemoval: true,
      pageErrors: 0,
      sends: 0,
      liveProvider: false,
    };
  } finally {
    await context?.close();
    await fixture.close();
  }
};
