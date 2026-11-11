import { assert } from './e2e-chat.mjs';
import { openQuestionPreview } from './question-preview.mjs';

export const verifyQuestionDisclosures = async ({ page, base }) => {
  const url = `${base}/?disclosure-check=1#/automation`;
  await page.goto(url);
  const { panel, preview } = await openQuestionPreview(page);
  const question = preview.getByLabel('Question or pattern', { exact: true });
  await question.fill('Retain this unsaved preview question.');
  const document = await page.evaluateHandle(() => globalThis.document);
  await page.goto(url);
  assert(
    await document.evaluate((previous) => previous === globalThis.document),
    'identical fragment URL retains the real browser document'
  );
  await openQuestionPreview(page);
  assert(
    (await question.inputValue()) === 'Retain this unsaved preview question.',
    'opening already open sections preserves the draft'
  );
  await preview.locator(':scope > summary').click();
  await openQuestionPreview(page);
  assert(
    (await panel.evaluate((node) => node.open)) &&
      (await preview.evaluate((node) => node.open)) &&
      (await question.inputValue()) === 'Retain this unsaved preview question.',
    'a closed nested section opens without closing its parent or losing edits'
  );
  await document.dispose();
  return { cases: 3 };
};
