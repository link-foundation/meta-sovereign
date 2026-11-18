import assert from 'node:assert/strict';
import { legacyCatalogsServer } from '../../../experiments/issue-56/vk-legacy-catalogs-fixture.mjs';
import { vkBirthdaySettings } from '../../src/automation/vk-birthday-settings.js';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
  vkReviewedControls,
} from './vk-automation-browser.mjs';

export const verifyVkReadFailure = async (browser, options = {}) => {
  const fixture = await legacyCatalogsServer({ invalid: true });
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    const { panel, ready, action } = vkReviewedControls(page, 'birthday');
    const messages = panel.locator('[data-birthday-field=messages]');
    const alert = panel.getByRole('alert');
    const enabled = panel.locator('[data-action=vk-birthday-enabled]');
    assert.equal((await fetch(`${fixture.base}/api/vk/birthday`)).status, 400);
    if (options.before) {
      await ready();
      assert.ok((await messages.inputValue()).includes('Happy birthday!'));
      assert.equal(await alert.count(), 0);
    } else {
      await alert.waitFor();
      assert.equal(await messages.count(), 0);
      assert.equal(await enabled.isDisabled(), true);
    }
    await captureVkAutomationLayouts(
      page,
      options.before ? messages : alert,
      options.screenshots,
      `${options.before ? 'before' : 'after'}-birthday`
    );
    if (!options.before) {
      const saved = await fixture.store.get(vkBirthdaySettings.keys.job);
      const owner = 'Owner birthday: first\nOwner birthday: second';
      await fixture.store.put({ ...saved, messages: owner.split('\n') });
      await action('refresh');
      assert.equal(await messages.inputValue(), owner);
      await fixture.store.put(saved);
      await action('refresh');
      await alert.waitFor();
      assert.equal(await messages.inputValue(), owner);
      assert.deepEqual(
        await fixture.store.get(vkBirthdaySettings.keys.job),
        saved
      );
      await captureVkAutomationLayouts(
        page,
        messages,
        options.screenshots,
        'retained-birthday'
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.effects, []);
    assert.equal(fixture.messages(), 0);
    return {
      refusalVisible: !options.before,
      acknowledgedSettingsRetained: !options.before,
      providerWrites: 0,
    };
  });
};
