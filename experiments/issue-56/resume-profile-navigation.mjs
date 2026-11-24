import { mkdir } from 'node:fs/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { openChatApp } from '../../js/tests/helpers/e2e-chat.mjs';
import { openQuestionPreview } from '../../js/tests/helpers/question-preview.mjs';
import { verifyQuestionProfile } from '../../js/tests/helpers/e2e-question-profile.mjs';
import { verifyQuestionSharedProfile } from '../../js/tests/helpers/e2e-question-shared-profile.mjs';
import { verifyQuestionLegacyProfile } from '../../js/tests/helpers/e2e-question-legacy-profile.mjs';
import { verifyResumeProfile } from '../../js/tests/helpers/e2e-resume-profile.mjs';
import {
  traceBrowserDetails,
  inputTrace,
} from '../../js/tests/helpers/e2e-input-trace.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../js/src/web/tutorial.js';

const store = createMemoryStore();
const fixture = await openChatApp('resume-profile-navigation', { store });
const { page, base, finish } = fixture;
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
await traceBrowserDetails(page, '[data-question-controls]');
await finish(async () => {
  await page.goto(`${base}/#/automation`);
  const { panel, preview } = await openQuestionPreview(page);
  const fields = preview.locator(
    ':scope > [data-answer-profile] > [data-profile-values]'
  );
  await fields
    .getByLabel('Field name, e.g. city', { exact: true })
    .fill('email');
  await fields.getByRole('button', { name: 'Add field', exact: true }).click();
  await fields
    .getByLabel('email', { exact: true })
    .fill('initial@example.test');
  await verifyQuestionProfile({ page, panel, preview, store });
  await verifyQuestionSharedProfile({ page, base, store });
  await verifyQuestionLegacyProfile({ page, base, store });
  console.log(
    '[profile-navigation-before]',
    JSON.stringify(await inputTrace(page))
  );
  try {
    await verifyResumeProfile({ page, base, panel, store });
    console.log(
      '[profile-navigation-after]',
      JSON.stringify(await inputTrace(page))
    );
  } finally {
    await mkdir('docs/screenshots/issue-56-profile-navigation', {
      recursive: true,
    });
    await page.screenshot({
      path: `docs/screenshots/issue-56-profile-navigation/${process.argv.includes('--baseline') ? 'passing-baseline' : 'diagnostic'}.png`,
    });
  }
});
