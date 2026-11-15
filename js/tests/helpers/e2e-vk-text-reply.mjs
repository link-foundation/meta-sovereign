import assert from 'node:assert/strict';
import {
  vkAutomationBrowser,
  captureVkAutomationLayouts,
  previewVkAutomation,
  saveVkAutomation,
} from './vk-automation-browser.mjs';

export const verifyVkTextReply = async (
  browser,
  server,
  kind,
  { before = false, screenshots } = {}
) => {
  const fixture = await server();
  const { context, page, errors } = await vkAutomationBrowser(
    browser,
    '👋',
    fixture.base
  );
  try {
    await page.goto(`${fixture.base}/#/automation`);
    await page.locator('[data-automation="automation:greet-back"]').waitFor();
    const action = page.locator(`[data-automation="automation:${kind}"]`);
    assert.equal(await action.count(), before ? 0 : 1);
    if (!before) {
      await action.click();
      const editor = page.locator('.automation-editor');
      assert.equal(
        await editor.locator('[name="incomingRecognizer"]').inputValue(),
        kind
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
        .fill('My informal reply <friend>');
      await editor.locator('[name="formal"]').fill('My formal reply <friend>');
      const alternatives =
        kind === 'acquaintance'
          ? {
              informal: [
                'Informal introduction <one>',
                'Informal introduction <two>',
              ],
              formal: [
                'Formal introduction <one>',
                'Formal introduction <two>',
              ],
            }
          : null;
      if (alternatives) {
        await editor
          .locator('[name="alternativeInformal"]')
          .fill(alternatives.informal.join('\n\n'));
        await editor
          .locator('[name="alternativeFormal"]')
          .fill(alternatives.formal.join('\n\n'));
      }
      assert.equal(
        await editor.locator('[name="cooldownDays"]').inputValue(),
        '1'
      );
      const saved = await saveVkAutomation(page);
      assert.equal(saved.action.kind, `reply-${kind}`);
      if (alternatives) {
        assert.deepEqual(saved.action.alternatives, alternatives);
      }
      await page.reload();
      await action.click();
      assert.equal(
        await editor.locator('[name="informal"]').inputValue(),
        'My informal reply <friend>'
      );
      const updated = await previewVkAutomation(page);
      if (alternatives) {
        for (const draft of updated.drafts) {
          assert.ok(alternatives[draft.form].includes(draft.text));
        }
        for (const form of ['informal', 'formal']) {
          const name =
            form === 'informal' ? 'alternativeInformal' : 'alternativeFormal';
          assert.equal(
            await editor.locator(`[name="${name}"]`).inputValue(),
            alternatives[form].join('\n\n')
          );
        }
        assert.deepEqual(
          (await previewVkAutomation(page)).drafts.map((d) => d.text),
          updated.drafts.map((d) => d.text)
        );
      } else {
        assert.deepEqual(
          updated.drafts.map((d) => d.text),
          ['My informal reply <friend>', 'My formal reply <friend>']
        );
      }
    }
    await captureVkAutomationLayouts(
      page,
      page.locator(
        before
          ? '.automation-list'
          : kind === 'acquaintance'
            ? '[data-acquaintance-catalog]'
            : '[name="actionKind"]'
      ),
      screenshots,
      before ? 'before' : 'after'
    );
    assert.deepEqual(errors, []);
    assert.equal(fixture.vk.calls.length, 0);
    return {
      cases: 1,
      [`${kind}Available`]: !before,
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
