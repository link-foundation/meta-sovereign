import assert from 'node:assert/strict';
import path from 'node:path';
import { cacheServer } from '../../../experiments/issue-56/vk-cache-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
import { decoded } from './e2e-form-review.mjs';

export const verifyVkCache = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await cacheServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const panel = page.locator('[data-vk-cache]');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingCacheControls: true,
          providerReads: fixture.calls.length,
        };
      }
      await panel.waitFor();
      const action = async (name, endpoint = name) => {
        const response = page.waitForResponse((r) =>
          r.url().endsWith(`/api/vk/cache/${endpoint}`)
        );
        await panel.locator(`[data-cache-action=${name}]`).click();
        const answer = await decoded(await response);
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-vk-cache]')
              ?.getAttribute('aria-busy') === 'false'
        );
        return answer;
      };
      await panel.locator('[data-cache-field=accountId]').fill('1');
      await panel.locator('[data-cache-field=peerId]').fill('42');
      await panel.locator('[data-cache-field=maxPages]').fill('1');
      await action('inspect');
      await panel.locator('[data-cache-empty]').waitFor();
      assert.equal(fixture.calls.length, 0);
      await action('refresh');
      assert.equal(
        await panel
          .locator('[data-cache-state]')
          .getAttribute('data-cache-state'),
        'partial'
      );
      assert.ok(
        (await panel.locator('[data-cache-state]').innerText()).includes(
          '200 of 401'
        )
      );
      await captureVkAutomationLayouts(page, panel, screenshots, 'partial');
      await action('refresh');
      await action('refresh');
      assert.equal(
        await panel
          .locator('[data-cache-state]')
          .getAttribute('data-cache-state'),
        'complete'
      );
      const providerReads = fixture.calls.length;
      await panel
        .locator('[data-cache-field=folder]')
        .fill(path.join(fixture.folder, 'browser-export'));
      const exported = await action('export');
      assert.equal(exported.messages, 401);
      assert.equal(exported.coverage.complete, true);
      await panel.locator('[data-cache-exported]').waitFor();
      assert.ok(
        (
          await panel.locator('[data-cache-export-coverage]').innerText()
        ).includes('401 of 401')
      );
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-cache-exported]'),
        screenshots,
        'after'
      );
      await page.reload();
      await panel.waitFor();
      await panel.locator('[data-cache-field=accountId]').fill('1');
      await panel.locator('[data-cache-field=peerId]').fill('42');
      const retained = await action('inspect');
      assert.equal(retained.cache.count, 401);
      assert.equal(fixture.calls.length, providerReads);
      assert.equal(fixture.stats().messages, 0);
      assert.deepEqual(errors, []);
      return {
        completeHistory: 401,
        boundedParts: true,
        reloadWithoutProvider: true,
        providerReads,
        unexpectedMessages: 0,
        pageErrors: 0,
      };
    }
  );
};
