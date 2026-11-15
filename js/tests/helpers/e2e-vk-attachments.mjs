import assert from 'node:assert/strict';
import {
  attachmentServer,
  attachmentArchive,
  attachmentMessage,
  photo,
} from '../../../experiments/issue-56/vk-attachments-fixture.mjs';
import { importInto } from '../../src/sources/index.js';
import { listVkAttachments } from '../../src/sources/vk-attachment-metadata.js';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
} from './vk-automation-browser.mjs';

export const verifyVkAttachments = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await attachmentServer();
  const { context, page, errors } = await vkAutomationBrowser(
    browser,
    '📎',
    fixture.base
  );
  context.setDefaultTimeout(10000);
  try {
    await page.goto(`${fixture.base}/#conn-vk/manual`);
    await page.getByRole('heading', { name: 'VK', exact: true }).waitFor();
    const panel = page.locator('[data-vk-attachments]');
    if (before) {
      assert.equal(await panel.count(), 0);
      await captureVkAutomationLayouts(
        page,
        page.getByRole('heading', { name: 'VK', exact: true }),
        screenshots,
        'before'
      );
      return { missingCollection: true, providerEffects: fixture.effects() };
    }
    const enabled = panel.locator('[data-action=vk-attachments-enabled]');
    await panel.locator('[data-vk-attachment]').first().waitFor();
    assert.equal(await panel.locator('[data-vk-attachment]').count(), 3);
    assert.equal(await enabled.isChecked(), true);
    const first = panel.locator(
      '[data-vk-attachment="attachment:vk:photo:41:11"]'
    );
    await first.locator('summary').click();
    assert.match(
      await first.locator('pre').textContent(),
      /First <script>fixture<\/script> 元数据/u
    );
    assert.equal(await first.locator('script').count(), 0);
    await captureVkAutomationLayouts(page, first, screenshots, 'after');
    await enabled.click();
    await page.waitForFunction(() => {
      const control = document.querySelector(
        '[data-action=vk-attachments-enabled]'
      );
      return control && !control.disabled && !control.checked;
    });
    await importInto(
      fixture.store,
      'vk',
      attachmentArchive(attachmentMessage(6, [photo(16)]))
    );
    await page.reload();
    await enabled.waitFor();
    await page.waitForFunction(() => {
      const control = document.querySelector(
        '[data-action=vk-attachments-enabled]'
      );
      return control && !control.disabled;
    });
    assert.equal(await enabled.isChecked(), false);
    assert.equal(await panel.locator('[data-vk-attachment]').count(), 3);
    fixture.refuseWrites(true);
    await enabled.click();
    await panel.getByRole('alert').waitFor();
    assert.equal(
      await enabled.isChecked(),
      false,
      'a refused write must retain the acknowledged setting'
    );
    assert.equal(await panel.locator('[data-vk-attachment]').count(), 3);
    await captureVkAutomationLayouts(
      page,
      panel.getByRole('alert'),
      screenshots,
      'after-refusal'
    );
    fixture.refuseWrites(false);
    await enabled.click();
    await page.waitForFunction(() => {
      const control = document.querySelector(
        '[data-action=vk-attachments-enabled]'
      );
      return control && !control.disabled && control.checked;
    });
    await importInto(
      fixture.store,
      'vk',
      attachmentArchive(attachmentMessage(7, [photo(17)]))
    );
    await panel.locator('[data-action=vk-attachments-refresh]').click();
    await panel
      .locator('[data-vk-attachment="attachment:vk:photo:41:17"]')
      .waitFor();
    assert.equal(await panel.locator('[data-vk-attachment]').count(), 4);
    assert.equal(
      (await listVkAttachments(fixture.store)).items.some(
        (row) => row.externalId === '16'
      ),
      false
    );
    assert.equal(fixture.effects(), 0);
    assert.deepEqual(errors, []);
    return {
      records: 4,
      firstObservationRetained: true,
      pausedRecordSkipped: true,
      refusalRetained: true,
      providerEffects: 0,
      pageErrors: 0,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
