import { mkdir } from 'node:fs/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp, assert } from '../../js/tests/helpers/e2e-chat.mjs';
import { openQuestionPreview } from '../../js/tests/helpers/question-preview.mjs';
import { decoded } from '../../js/tests/helpers/e2e-form-review.mjs';
import { verifyQuestionWeighted } from '../../js/tests/helpers/e2e-question-weighted.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';
import {
  weightedQuestions,
  seedWeightedAnswers,
} from './question-weighted-fixture.mjs';

const store = createMemoryStore();
await seedWeightedAnswers(store);
let sends = 0;
const { page, base, until, finish } = await openChatApp('question-weighted', {
  store,
  send: async () => {
    sends++;
    throw new Error('Read-only preview must not send');
  },
});
await page.addInitScript(
  ({ key, version }) => {
    globalThis.localStorage.setItem(
      key,
      JSON.stringify({ off: true, v: version })
    );
    globalThis.localStorage.setItem('metaSovereignLocale', 'en');
  },
  { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
);
await finish(async () => {
  await mkdir('docs/screenshots/issue-56-question-weighted', {
    recursive: true,
  });
  await page.goto(`${base}/#/automation`);
  if (process.argv.includes('--before')) {
    const { preview } = await openQuestionPreview(page);
    assert(
      (await preview.getByLabel('Matching method', { exact: true }).count()) ===
        0,
      'parent has no method selector'
    );
    await preview
      .getByLabel('Question or pattern', { exact: true })
      .fill(weightedQuestions.asked);
    await preview.getByLabel('Minimum similarity (%)').fill('70');
    const response = page.waitForResponse((item) =>
      item.url().endsWith('/api/automations/answers/plan')
    );
    await preview
      .getByRole('button', { name: 'Preview answer', exact: true })
      .click();
    assert(
      (await decoded(await response)).match === 'unanswered',
      'parent misses the rewording'
    );
    await preview.locator('[data-answer-preview]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/screenshots/issue-56-question-weighted/before.png',
    });
  } else {
    await verifyQuestionWeighted({ page, store, until });
  }
  assert(sends === 0, 'no delivery during matching review');
  console.log(JSON.stringify({ sends, isolated: true }));
});
