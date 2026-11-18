import assert from 'node:assert/strict';
import {
  vkTokenFixture,
  tokenFixtureValue as token,
} from '../../../experiments/issue-56/vk-token-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkToken = async (
  browser,
  { before = false, screenshots, beforeBundle } = {}
) =>
  reviewVkConnection(
    browser,
    await vkTokenFixture(),
    async ({ page, errors, heading }) => {
      const panel = page.locator('[data-vk-token]');
      if (before) {
        if (beforeBundle) {
          await page.route('**/app.min.js', (route) =>
            route.fulfill({
              contentType: 'text/javascript',
              body: beforeBundle,
            })
          );
          await page.reload();
          await heading.waitFor();
        }
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(
          page,
          heading,
          screenshots,
          'before',
          true
        );
        return { missingAcquisition: true, liveProvider: false };
      }
      await panel.locator('[data-vk-token-state=idle]').waitFor();
      const action = (name) => panel.locator(`[data-vk-token-action=${name}]`);
      const confirm = panel.locator('[data-vk-token-confirm]');
      const value = panel.locator('[data-vk-token-value]');
      assert.equal(await value.getAttribute('type'), 'password');
      assert.equal(await action('start').isDisabled(), true);
      await confirm.check();
      await action('start').click();
      await panel.locator('[data-vk-token-state=waiting]').waitFor();
      await action('cancel').click();
      await panel.locator('[data-vk-token-state=cancelled]').waitFor();
      await value.fill(`https://foreign.invalid/#access_token=${token}`);
      await confirm.check();
      await action('import').click();
      await panel
        .getByText(
          'Only the exact HTTPS oauth.vk.com/blank.html redirect URL is accepted.',
          { exact: true }
        )
        .waitFor();
      await value.fill(token);
      await confirm.check();
      await action('import').click();
      await panel.locator('[data-vk-token-state=saved]').waitFor();
      assert.equal(await value.inputValue(), '');
      assert.match(
        await panel.locator('[data-vk-token-identity]').innerText(),
        /Fixture User.*42/
      );
      assert.equal(
        (
          await page.evaluate(() =>
            JSON.stringify({ ...globalThis.localStorage })
          )
        ).includes(token),
        false
      );
      await captureVkAutomationLayouts(page, panel, screenshots, 'after', true);
      await page.reload();
      await panel.locator('[data-vk-token-state=saved]').waitFor();
      assert.equal(await confirm.isChecked(), false);
      assert.equal(await value.inputValue(), '');
      await value.fill('hold_fixture_token_for_cancel');
      await confirm.check();
      await action('import').click();
      await panel.locator('[data-vk-token-state=validating]').waitFor();
      await action('cancel').click();
      await panel.locator('[data-vk-token-state=cancelled]').waitFor();
      await value.fill('no_messages_fixture_token_12345');
      await confirm.check();
      await action('import').click();
      await panel.locator('[data-vk-token-state=saved]').waitFor();
      assert.match(await panel.innerText(), /refused message access/);
      await captureVkAutomationLayouts(
        page,
        panel,
        screenshots,
        'after-no-messages'
      );
      let reads = 0;
      await page.route('**/api/vk/token', (route) => {
        reads++;
        return reads === 1
          ? route.fulfill({ status: 503, body: 'fixture read failure' })
          : route.continue();
      });
      await action('refresh').click();
      await panel.getByRole('alert').waitFor();
      await panel.getByRole('alert').waitFor({ state: 'detached' });
      assert.equal(reads, 2);
      assert.match(await panel.innerText(), /refused message access/);
      await page.unroute('**/api/vk/token');
      assert.deepEqual(errors, []);
      return {
        liveProvider: false,
        confirmedImport: true,
        reloadReadOnly: true,
        cancellableValidation: true,
        noMessageCapability: true,
        boundedReadRecovery: true,
        secretNotInBrowserStorage: true,
        desktopAndPhoneFit: true,
      };
    }
  );
