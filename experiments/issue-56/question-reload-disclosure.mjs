// Reproduce a restored native disclosure with the real saved-answer fixture.
// Only the parent/current entry and disclosure state differ; no provider runs.
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { loadPreviousModule } from './previous-module.mjs';

const file = 'js/tests/e2e-questions-browser.mjs';
const transform = (source) => {
  const reload =
    'const verifyPersistedRule = async (saved) => {\n  await page.reload();';
  const verified = '  await verifyPersistedRule(saved);';
  if (
    source.split(reload).length !== 2 ||
    source.split(verified).length !== 2
  ) {
    throw new Error(
      'The saved-answer persistence entry changed; review this probe'
    );
  }
  return source
    .replace(
      reload,
      `${reload}
  page.setDefaultTimeout(3000);
  // Establish the open state through visible owner controls, as a native
  // browser restoration can do; keep the actual persistence assertions.
  await openQuestionDisclosure(panel);
  console.log('[question-reload]', JSON.stringify({
    restoredOpen: await panel.evaluate((node) => node.open),
    rules: (await rules()).length,
  }));
  await page.screenshot({ path: process.env.QUESTION_RELOAD_BEFORE });`
    )
    .replace(
      verified,
      `${verified}
  await page.screenshot({ path: process.env.QUESTION_RELOAD_AFTER });
  console.log('[question-reload]', JSON.stringify({
    persistedQuestion: true, persistedAnswer: true, persistedEquivalent: true,
    open: await panel.evaluate((node) => node.open), providerSends: 0,
  }));
  return;`
    );
};
if (process.env.QUESTION_RELOAD_PARENT === '1') {
  loadPreviousModule('72dc9552', file, transform);
} else {
  const target = new URL(`../../${file}`, import.meta.url).href;
  registerHooks({
    load(url, context, nextLoad) {
      return url === target
        ? {
            format: 'module',
            source: transform(readFileSync(new URL(url), 'utf8')),
            shortCircuit: true,
          }
        : nextLoad(url, context);
    },
  });
}
await import('../../js/tests/e2e-questions-browser.mjs');
