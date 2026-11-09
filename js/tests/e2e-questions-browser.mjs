// Production Q/A controls with an isolated store and no provider sends.
import { createMemoryStore } from '../src/storage/universal.js';
import { assert, fulfil, openChatApp } from './helpers/e2e-chat.mjs';
import { TUTORIAL_STORAGE_KEY, TUTORIAL_VERSION } from '../src/web/tutorial.js';

const store = createMemoryStore();
for (const [id, sender, body] of [
  [1, 'them', 'Какой у вас опыт?'],
  [2, 'me', 'Пять лет.'],
]) {
  await store.put({
    id: `msg:hh:1:${id}`,
    source: 'hh',
    chat: '1',
    sender,
    body,
    timestamp: `2026-11-09T10:00:0${id}Z`,
  });
}
const { page, base, until, finish } = await openChatApp('questions', { store });
const panel = page.locator('[data-question-controls]');
const editor = panel.locator('[data-answer-rule]');
const rules = () => store.query((link) => link.id?.startsWith('qa-rule:'));
const showPanel = async () => {
  await page.goto(`${base}/#/automation`);
  await panel.locator(':scope > summary').click();
  await editor.waitFor();
};
const verifyLearning = async (saved) => {
  await panel
    .locator('summary')
    .filter({ hasText: 'Learn from conversations' })
    .click();
  await panel
    .getByRole('button', { name: 'Preview learned answers', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .waitFor();
  assert((await rules()).length === 1, 'learning preview never writes');
  await panel
    .getByRole('button', { name: 'Save proposals for review', exact: true })
    .click();
  await until(async () => (await rules()).length === 2, 'proposals persisted');
  const learned = (await rules()).find((rule) => rule.id !== saved.id);
  assert(
    !learned.answers[0].approved && learned.answers[0].count === 1,
    'learning preserves observed evidence without granting approval'
  );
};

await finish(async () => {
  await page.addInitScript(
    ({ key, version }) =>
      globalThis.localStorage.setItem(
        key,
        JSON.stringify({ off: true, v: version })
      ),
    { key: TUTORIAL_STORAGE_KEY, version: TUTORIAL_VERSION }
  );
  await showPanel();
  await editor
    .getByLabel('Question or pattern', { exact: true })
    .fill('Где вы живете?');
  await editor.getByLabel('Answer', { exact: true }).fill('Живу в {{city}}.');
  await editor
    .getByRole('checkbox', {
      name: 'Approved for automatic sending',
      exact: false,
    })
    .check();
  await editor
    .getByLabel('Providers, comma-separated', { exact: false })
    .fill('hh, telegram, vk');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () => (await rules()).length === 1,
    'rule saved through the production API'
  );
  const saved = (await rules())[0];
  assert(
    saved.answers[0].approved && saved.answers[0].count === 0,
    'manual approval carries no invented frequency'
  );
  await page.reload();
  await panel.locator(':scope > summary').click();
  await panel
    .getByRole('button', { name: 'Где вы живете?', exact: true })
    .click();
  assert(
    (await editor.getByLabel('Answer', { exact: true }).inputValue()) ===
      saved.answers[0].text,
    'saved answer survives reload'
  );

  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: 'Preview answer' }),
  });
  await panel.locator('summary').filter({ hasText: 'Preview answer' }).click();
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('Где вы живете?');
  await preview.getByLabel('Provider for preview', { exact: true }).fill('hh');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .getByText('Missing profile values: city', { exact: true })
    .waitFor();
  const profile = preview.locator('[data-answer-profile]');
  await profile
    .getByRole('textbox', { name: 'Field name, e.g. city' })
    .fill('city');
  await profile.getByRole('button', { name: 'Add field', exact: true }).click();
  await profile.getByLabel('city', { exact: true }).fill('Nha Trang');
  await preview
    .getByRole('button', { name: 'Preview answer', exact: true })
    .click();
  await preview
    .locator('[data-answer-preview]')
    .getByText('Живу в Nha Trang.', { exact: true })
    .waitFor();
  await preview.getByText('Approved and complete.', { exact: true }).waitFor();
  if (process.env.QUESTIONS_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 1100 });
    await preview.evaluate((element) =>
      element.scrollIntoView({ block: 'center' })
    );
    await page.screenshot({
      path: process.env.QUESTIONS_SCREENSHOT,
      scale: 'css',
    });
  }

  await verifyLearning(saved);

  await panel
    .getByRole('button', { name: 'Create question automation', exact: true })
    .click();
  const automation = page.locator('form.automation-editor');
  await automation.waitFor();
  assert(
    (await automation.locator('[name="actionKind"]').inputValue()) ===
      'answer-questions',
    'question action selected'
  );
  assert(
    (await automation
      .locator('[data-answer-profile]')
      .getByLabel('city', { exact: true })
      .inputValue()) === 'Nha Trang',
    'profile carried into editable action'
  );
  await automation.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    async () =>
      (
        await store.query(
          (link) =>
            link.id?.startsWith('automation:') &&
            link.action?.kind === 'answer-questions'
        )
      ).length === 1,
    'question automation saved'
  );

  await page.route('**/api/automations/answers/save', (route) =>
    fulfil(route, { error: 'Answer fixture refusal', status: 'failed' }, 500)
  );
  await editor
    .getByLabel('Answer', { exact: true })
    .fill('Keep my unsaved edit');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'Answer fixture refusal' })
    .waitFor();
  assert(
    (await store.get(saved.id)).answers[0].text === saved.answers[0].text,
    'refused save never changes stored rule'
  );
  assert(
    (await editor.getByLabel('Answer', { exact: true }).inputValue()) ===
      'Keep my unsaved edit',
    'refused save retains the edit'
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    'question controls fit a mobile viewport'
  );
  if (process.env.QUESTIONS_MOBILE_SCREENSHOT) {
    await editor.getByLabel('Answer', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: process.env.QUESTIONS_MOBILE_SCREENSHOT,
      scale: 'css',
    });
  }
});
