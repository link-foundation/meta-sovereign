import assert from 'node:assert/strict';
import { friendsServer } from '../../../experiments/issue-56/vk-friends-fixture.mjs';
import { independentVkKinds as kinds } from '../../../experiments/issue-56/vk-independent-fixture.mjs';
import { decoded } from './e2e-form-review.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

/** Real shared controls and routes; scheduling and provider actions stay off. */
export const verifyVkIndependent = async (browser) => {
  const fixture = await friendsServer();
  return reviewVkConnection(browser, fixture, async ({ page, errors }) => {
    const ready = () =>
      page.waitForFunction(
        (names) =>
          names.every((name) => {
            const input = document.querySelector(
              `[data-action=vk-${name}-enabled]`
            );
            return input && !input.disabled;
          }),
        kinds
      );
    const record = (kind) => fixture.store.get(`provider-job:vk:${kind}`);
    const states = async (selected) => {
      await ready();
      assert.deepEqual(
        await page.evaluate(
          (names) =>
            names.map(
              (name) =>
                document.querySelector(`[data-action=vk-${name}-enabled]`)
                  .checked
            ),
          kinds
        ),
        kinds.map((kind) => kind === selected)
      );
    };
    const change = async (kind, action, enabled) => {
      const pending = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/vk/${kind}` &&
          response.request().method() === 'POST'
      );
      await page.locator(`[data-action=vk-${kind}-${action}]`).click();
      const answer = await decoded(await pending);
      assert.equal(answer.ok, true);
      assert.equal(answer.settings.enabled, enabled);
      assert.equal(answer.schedulerRunning, false);
      await ready();
    };
    await states(null);
    await page.locator('[data-wall-field=communities]').fill('42');
    await change('wall', 'save', false);
    const originals = Object.fromEntries(
      await Promise.all(kinds.map(async (kind) => [kind, await record(kind)]))
    );
    for (const selected of kinds) {
      await change(selected, 'enabled', true);
      for (const kind of kinds) {
        if (kind !== selected) {
          assert.deepEqual(await record(kind), originals[kind]);
        }
      }
      await page.reload();
      await states(selected);
      assert.equal(
        await page.locator('[data-wall-field=communities]').inputValue(),
        '42'
      );
      if (
        selected === 'birthday' &&
        process.env.VK_INDEPENDENT_SCREENSHOTS === '1'
      ) {
        await captureVkAutomationLayouts(
          page,
          page.locator('[data-action=vk-birthday-enabled]'),
          'docs/screenshots/issue-56-vk-independent',
          'birthday-enabled',
          true
        );
      }
      await change(selected, 'enabled', false);
      await states(null);
      originals[selected] = await record(selected);
    }
    assert.equal(fixture.fake.calls.length, 0);
    assert.equal(fixture.messages(), 0);
    assert.deepEqual(errors, []);
    const receipt = {
      independentPolicies: kinds.length,
      acknowledgedToggles: 12,
      reloads: kinds.length,
      retainedFields: true,
      schedulerRunning: false,
      providerEffects: 0,
      pageErrors: 0,
      liveProvider: false,
    };
    console.log('[vk-independent]', JSON.stringify(receipt));
    return receipt;
  });
};
