import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { templateBoundaryExample } from './question-template-fixture.mjs';

const inspect = async (page, { base, pattern, question, answer }) => {
  const exceptions = [];
  page.on('pageerror', (error) => exceptions.push(error.message));
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/?question-boundary-review#/automation`);
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const editor = panel.locator('[data-answer-rule]');
  await editor.getByLabel('Question or pattern', { exact: true }).fill(pattern);
  await editor.getByLabel('Answer', { exact: true }).fill(answer);
  await editor
    .getByLabel('Approved for automatic sending with this saved rule')
    .check();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel.getByText('Answer rule saved.', { exact: true }).waitFor();
  const review = panel.locator('[data-browser-answer-controls]');
  await review.locator(':scope > summary').click();
  await review.getByLabel('Web-chat reference', { exact: true }).fill('7');
  await review.locator('[data-browser-answer-inspect]').click();
  await review.getByText(question, { exact: true }).waitFor();
  const match = review.getByText('No matching answer', { exact: true });
  await match.waitFor();
  await review
    .getByText('Review required before automatic sending.', { exact: true })
    .waitFor();
  await match.scrollIntoViewIfNeeded();
  const draft = await review.locator('[data-browser-text-draft]').inputValue();
  const sendDisabled = await review
    .locator('[data-browser-text-send]')
    .isDisabled();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > globalThis.innerWidth
  );
  if (draft || !sendDisabled || overflow || exceptions.length) {
    throw new Error(
      JSON.stringify({ draft, sendDisabled, overflow, exceptions })
    );
  }
  return {
    question,
    draft,
    sendDisabled,
    overflow,
    exceptions,
    liveProvider: false,
  };
};

export const templateBoundaryMcpCode = (base) =>
  mcpInspectionCode(inspect, { base, ...templateBoundaryExample });
