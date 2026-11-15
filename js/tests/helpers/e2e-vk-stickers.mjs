import assert from 'node:assert/strict';
import path from 'node:path';
import { stickerServer } from '../../../experiments/issue-56/vk-stickers-fixture.mjs';
import {
  reviewVkConnection,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';
import { decoded } from './e2e-form-review.mjs';

const catalogControls = (page, panel) => ({
  field: (name) => panel.locator(`[data-sticker-field=${name}]`),
  action: async (name) => {
    const waiting = page.waitForResponse((response) =>
      response.url().endsWith(`/api/vk/stickers/${name}`)
    );
    await panel.locator(`[data-sticker-action=${name}]`).click();
    const answer = await decoded(await waiting);
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-vk-stickers]')
          ?.getAttribute('aria-busy') === 'false'
    );
    assert.equal(answer.ok, true);
    return answer;
  },
});
const chooseInCollection = async (page, fixture) => {
  await page.goto(`${fixture.base}/#/greetings`);
  const editor = page.locator('[data-sticker-collections]');
  await editor
    .locator('[data-collection-field=collection]')
    .selectOption('vk:greeting');
  const panel = editor.locator('[data-vk-stickers]');
  const { field, action } = catalogControls(page, panel);
  await field('accountId').fill('1');
  await action('inspect');
  await panel.locator('[data-catalog-choose="101"]').click();
  assert.equal(
    await editor
      .locator('[data-collection-sticker="vk:101"]')
      .getAttribute('aria-pressed'),
    'true'
  );
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/sticker-collections') &&
      response.request().method() === 'POST'
  );
  await editor.locator('[data-action=collections-save]').click();
  assert.equal((await decoded(await saved)).ok, true);
  await page.reload();
  await editor
    .locator('[data-collection-field=collection]')
    .selectOption('vk:greeting');
  assert.equal(
    await editor
      .locator('[data-collection-sticker="vk:101"]')
      .getAttribute('aria-pressed'),
    'true'
  );
};
export const verifyVkStickers = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await stickerServer();
  return reviewVkConnection(
    browser,
    fixture,
    async ({ page, errors, heading }) => {
      const panel = page.locator('[data-vk-stickers]');
      if (before) {
        assert.equal(await panel.count(), 0);
        await captureVkAutomationLayouts(page, heading, screenshots, 'before');
        return {
          missingCatalogControls: true,
          providerReads: fixture.calls.length,
        };
      }
      await panel.waitFor();
      const { field, action } = catalogControls(page, panel);
      await field('accountId').fill('1');
      await action('inspect');
      await panel.locator('[data-catalog-empty]').waitFor();
      assert.equal(fixture.calls.length, 0);
      await action('refresh');
      assert.deepEqual(
        (await fixture.service.inspect({ accountId: 1 })).catalog.greetingIds,
        ['101', '102']
      );
      await field('category').selectOption('greeting');
      await action('inspect');
      assert.equal(await panel.locator('[data-catalog-sticker]').count(), 2);
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-sticker-catalog-evidence]'),
        screenshots,
        'catalog'
      );
      await panel.locator('details').evaluate((node) => {
        node.open = true;
      });
      await field('received').fill('{invalid JSON');
      await panel.locator('[data-sticker-action=filter]').click();
      await panel.locator('[role=alert]').waitFor();
      assert.equal(await panel.locator('[data-catalog-sticker]').count(), 2);
      await action('inspect');
      await field('received').fill(
        JSON.stringify({
          101: { productId: 11 },
          401: { productId: 13 },
          999: { type: 'photo' },
        })
      );
      await panel.locator('[data-sticker-action=filter]').click();
      await panel.locator('[data-filtered-products]').waitFor();
      const calls = fixture.calls.length;
      await field('folder').fill(path.join(fixture.folder, 'native-export'));
      const exported = await action('export');
      assert.equal(exported.artworkDownloaded, false);
      await panel.locator('[data-catalog-exported]').waitFor();
      await captureVkAutomationLayouts(
        page,
        panel.locator('[data-catalog-exported]'),
        screenshots,
        'after'
      );
      await page.reload();
      await field('accountId').fill('1');
      assert.equal((await action('inspect')).catalog.usable, 103);
      await chooseInCollection(page, fixture);
      assert.equal(fixture.calls.length, calls);
      assert.equal(fixture.stats().messages, 0);
      assert.deepEqual(errors, []);
      return {
        usableStickers: 103,
        usableGreetingIds: 2,
        receivedFiltering: true,
        metadataExport: true,
        collectionChoiceRetained: true,
        reloadWithoutProvider: true,
        syntheticReads: calls,
        unexpectedMessages: 0,
        pageErrors: 0,
      };
    }
  );
};
