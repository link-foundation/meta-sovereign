import assert from 'node:assert/strict';
import { identityServer } from '../../../experiments/issue-56/vk-identity-fixture.mjs';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
  previewVkAutomation,
  saveVkAutomation,
} from './vk-automation-browser.mjs';

export const verifyVkIdentity = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await identityServer();
  const { context, page, errors } = await vkAutomationBrowser(browser, '👋');
  try {
    await page.goto(`${fixture.base}/#/automation`);
    await page.locator('[data-automation="automation:greet-back"]').waitFor();
    const action = page.locator('[data-automation="automation:identity"]');
    assert.equal(await action.count(), before ? 0 : 1);
    if (!before) {
      await action.click();
      const editor = page.locator('.automation-editor');
      assert.equal(
        await editor.locator('[name="incomingRecognizer"]').inputValue(),
        'identity'
      );
      const plan = await previewVkAutomation(page);
      assert.deepEqual(
        plan.drafts.map((d) => [d.chat, d.form]),
        [
          ['41', 'informal'],
          ['42', 'formal'],
        ]
      );
      await editor
        .locator('[name="informal"]')
        .fill('My informal identity <friend>');
      await editor
        .locator('[name="formal"]')
        .fill('My formal identity <friend>');
      const saved = await saveVkAutomation(page);
      assert.equal(saved.action.kind, 'reply-identity');
      await page.reload();
      await action.click();
      assert.equal(
        await editor.locator('[name="informal"]').inputValue(),
        'My informal identity <friend>'
      );
      const updated = await previewVkAutomation(page);
      assert.deepEqual(
        updated.drafts.map((d) => d.text),
        ['My informal identity <friend>', 'My formal identity <friend>']
      );
    }
    await captureVkAutomationLayouts(
      page,
      page.locator(before ? '.automation-list' : '[name="actionKind"]'),
      screenshots,
      before ? 'before' : 'after'
    );
    assert.deepEqual(errors, []);
    assert.equal(fixture.vk.calls.length, 0);
    return {
      cases: 1,
      identityAvailable: !before,
      savedVariants: !before,
      pageErrors: errors,
      sends: 0,
      resourcesClosedOnExit: true,
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
