import assert from 'node:assert/strict';
import { legacyCatalogsServer } from '../../../experiments/issue-56/vk-legacy-catalogs-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
  vkReviewedControls,
} from './vk-automation-browser.mjs';

export const verifyVkLegacyCatalogs = async (browser, options = {}) => {
  const fixture = await legacyCatalogsServer();
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    for (const name of ['wall', 'birthday']) {
      const { panel, ready } = vkReviewedControls(page, name);
      await ready();
      const messages = panel.locator(`[data-${name}-field=messages]`);
      if (options.before) {
        assert.equal(
          (await fetch(`${fixture.base}/api/vk/${name}`)).status,
          400
        );
        assert.notEqual(
          await messages.inputValue(),
          `Owner ${name}: first\nOwner ${name}: second`
        );
      } else {
        assert.equal(
          await messages.inputValue(),
          `Owner ${name}: first\nOwner ${name}: second`
        );
        const field = name === 'wall' ? 'communities' : 'stickers';
        assert.equal(
          await panel.locator(`[data-${name}-field=${field}]`).inputValue(),
          name === 'wall' ? '42,43' : '60302'
        );
        assert.equal(await panel.getByRole('alert').count(), 0);
      }
      await captureVkAutomationLayouts(
        page,
        messages,
        options.screenshots,
        `${options.before ? 'before' : 'after'}-${name}`
      );
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(fixture.effects, []);
    assert.equal(fixture.messages(), 0);
    return {
      ownerCatalogsReadable: !options.before,
      providerWrites: 0,
      pageErrors: 0,
    };
  });
};
