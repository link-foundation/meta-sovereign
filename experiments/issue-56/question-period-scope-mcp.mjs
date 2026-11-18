import { readFile } from 'node:fs/promises';
import {
  openQuestionDisclosure,
  openQuestionPreview,
  requestQuestionPreview,
} from '../../js/tests/helpers/question-preview.mjs';

// Independent MCP probe against final-period-ui.mjs --split-period.
const inspect = async (page) => {
  page.setDefaultTimeout(10000);
  await page.evaluate(() => {
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
    globalThis.localStorage.setItem(
      'metaSovereignTutorial',
      JSON.stringify({ off: true, v: 5 })
    );
  });
  await page.reload();
  await page.setViewportSize({ width: 1180, height: 1000 });
  const { panel, preview } = await openQuestionPreview(page);
  const run = async (expected, count) => {
    await requestQuestionPreview(preview, 'Where do you live?');
    await preview
      .locator('[data-answer-preview] > pre')
      .filter({ hasText: expected })
      .waitFor();
    const text = await preview
      .locator('[data-answer-preview] > pre')
      .textContent();
    if (text !== expected) {
      throw new Error(`Unexpected preview ${text}`);
    }
    await preview
      .getByText(`Observed answer turns: ${count}`, { exact: true })
      .waitFor();
  };
  // A parent probe stops after preserving its actual incorrect result.
  const before = new URL(page.url()).searchParams.has('before');
  await run(before ? 'Vietnam' : 'Vietnam.', before ? 4 : 5);
  await preview.screenshot({
    path: `docs/screenshots/issue-56-period-scope-${before ? 'before' : 'after'}.png`,
  });
  if (before) {
    return { before: true, observations: 4, text: 'Vietnam' };
  }
  const policy = panel.locator('[data-answer-policy]');
  await openQuestionDisclosure(policy);
  await policy
    .getByRole('button', { name: 'Refresh answers', exact: true })
    .click();
  await policy.locator('[data-answer-final-period]').selectOption('without');
  await policy.getByRole('button', { name: 'Save', exact: true }).click();
  await policy
    .getByText('Answer reuse policy saved.', { exact: true })
    .waitFor();
  await run('Vietnam', 5);
  await page.reload();
  await openQuestionPreview(page);
  await run('Vietnam', 5);
  await page.setViewportSize({ width: 390, height: 844 });
  await preview.locator('[data-answer-preview]').scrollIntoViewIfNeeded();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= globalThis.innerWidth
  );
  if (!fits) {
    throw new Error('Compact overflow');
  }
  return {
    observations: 5,
    defaultWith: true,
    configuredWithout: true,
    reload: true,
    compactFits: fits,
    liveProvider: false,
  };
};

// MCP has no ESM callback: compose only these repository-owned test helpers.
const shared = await readFile(
  new URL('../../js/tests/helpers/question-preview.mjs', import.meta.url),
  'utf8'
);
console.log(`async (page) => {
${shared.replaceAll('export const ', 'const ')}
return await (${inspect.toString()})(page);
}`);
