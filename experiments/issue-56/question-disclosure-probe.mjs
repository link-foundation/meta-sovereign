// Finite production-browser reproduction of consecutive notice-learning modes.
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyNoticeLearning } from '../../js/tests/helpers/e2e-notice-learning.mjs';
import { verifyQuestionDisclosures } from '../../js/tests/helpers/e2e-question-disclosures.mjs';
import { openQuestionPreview } from '../../js/tests/helpers/question-preview.mjs';
import {
  traceBrowserInputs,
  traceBrowserDetails,
  inputTrace,
} from '../../js/tests/helpers/e2e-input-trace.mjs';

const store = createMemoryStore();
const fixture = await openChatApp('question-disclosure', { store });
const { page, base, finish } = fixture;
page.setDefaultTimeout(5_000);
await traceBrowserInputs(page, '[data-question-controls] summary');
await traceBrowserDetails(page, '[data-question-controls]');
await page.addInitScript(() => {
  globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  globalThis.localStorage.setItem(
    'metaSovereignTutorial',
    JSON.stringify({ off: true, v: 5 })
  );
  globalThis.disclosureDocument = globalThis.crypto.randomUUID();
});
const state = async () => ({
  ...(await inputTrace(page)),
  document: await page.evaluate(() => globalThis.disclosureDocument),
});
await finish(async () => {
  try {
    if (process.env.QUESTION_DISCLOSURE_PREVIEW_ONLY === '1') {
      console.log(
        '[question-preview-reuse]',
        JSON.stringify(await verifyQuestionDisclosures(fixture))
      );
      if (process.env.QUESTION_DISCLOSURE_SCREENSHOT) {
        const { preview } = await openQuestionPreview(page);
        await preview
          .getByLabel('Question or pattern', { exact: true })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: process.env.QUESTION_DISCLOSURE_SCREENSHOT,
        });
      }
      return;
    }
    const url = `${base}/?notice-learning=1#/automation`;
    await page.goto(url);
    const root = page.locator('[data-question-controls]');
    await root.locator(':scope > summary').click();
    const opened = await state();
    await page.goto(url);
    const revisited = await state();
    console.log('[question-same-url]', JSON.stringify({ opened, revisited }));
    // A distinct query gives the actual first helper its original closed page.
    await page.goto(`${base}/?disclosure-probe=reset#/automation`);
    await verifyNoticeLearning({ ...fixture, store });
    console.log('[question-first-mode]', JSON.stringify(await state()));
    await verifyNoticeLearning({ ...fixture, store, patterns: true });
    console.log('[question-second-mode]', JSON.stringify(await state()));
  } finally {
    console.log('[question-final-state]', JSON.stringify(await state()));
  }
});
