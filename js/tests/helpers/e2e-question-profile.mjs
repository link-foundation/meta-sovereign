import {
  profileCv,
  profileContacts,
} from '../../../experiments/issue-56/question-profile-fixture.mjs';
import { assert, fulfil } from './e2e-chat.mjs';

export const verifyQuestionProfile = async ({
  page,
  panel,
  preview,
  store,
}) => {
  if (process.env.CI_BROWSER_DEBUG === '1') {
    page.on('pageerror', (error) => console.error(`[profile] ${error.stack}`));
  }
  await store.put(profileCv);
  const fields = preview.locator(':scope > [data-answer-profile]');
  const importer = fields.locator(':scope > [data-profile-import]');
  await importer.locator(':scope > summary').click();
  await importer
    .getByRole('button', { name: 'Load saved CVs', exact: true })
    .click();
  await importer.getByText('Saved CVs loaded.', { exact: true }).waitFor();
  await importer
    .getByLabel('Saved CV snapshot', { exact: true })
    .selectOption('cv:hh');
  const text = importer.getByLabel('Your contact details', { exact: true });
  await text.fill(profileContacts);
  await importer
    .getByRole('button', { name: 'Preview profile fields', exact: true })
    .click();
  const draft = importer.locator('[data-profile-draft]');
  await draft.waitFor();
  const current = await fields
    .getByLabel('email', { exact: true })
    .inputValue();
  assert(
    current !== 'cv-owner@example.test' &&
      current !== 'contact-owner@example.test',
    'preview keeps the current profile'
  );
  assert(
    (await draft
      .getByText('Different values are available. Choose a value explicitly.', {
        exact: true,
      })
      .count()) > 0,
    'conflicting contacts need a choice'
  );
  assert(
    await importer
      .getByRole('button', { name: 'Use selected fields', exact: true })
      .isDisabled(),
    'preview selects no values implicitly'
  );
  await draft
    .getByRole('checkbox', {
      name: 'email: contact-owner@example.test',
      exact: true,
    })
    .check();
  await draft
    .getByRole('checkbox', { name: 'location: Hanoi', exact: true })
    .check();
  assert(
    (await draft
      .getByText(`cv:hh · basics.email · ${profileCv.capturedAt}`, {
        exact: true,
      })
      .count()) === 1,
    'source evidence is visible'
  );
  if (process.env.QUESTIONS_PROFILE_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 1100 });
    await importer.evaluate((element) =>
      element.scrollIntoView({ block: 'start' })
    );
    await page.screenshot({
      path: process.env.QUESTIONS_PROFILE_SCREENSHOT,
      scale: 'css',
    });
  }
  await importer
    .getByRole('button', { name: 'Use selected fields', exact: true })
    .click();
  await importer
    .getByText(
      'Selected fields added to this draft. Save the draft to retain them.',
      { exact: true }
    )
    .waitFor();
  assert(
    (await fields.getByLabel('email', { exact: true }).inputValue()) ===
      'contact-owner@example.test',
    'only the chosen email is applied'
  );
  assert(
    (await fields.getByLabel('location', { exact: true }).inputValue()) ===
      'Hanoi',
    'selected CV facts reach the draft'
  );
  assert(
    (await store.get('cv:hh')).cv.basics.email === 'cv-owner@example.test',
    'CV remains intact'
  );

  await verifyProfileRecovery({ page, importer, fields, text, draft });
  await page.setViewportSize({ width: 390, height: 844 });
  await importer.evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    ),
    'import fields fit a mobile viewport'
  );
  if (process.env.QUESTIONS_PROFILE_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.QUESTIONS_PROFILE_MOBILE_SCREENSHOT,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 1200, height: 1000 });
  await verifyAutomationProfile({ page, panel });
};

const verifyAutomationProfile = async ({ page, panel }) => {
  await panel
    .getByRole('button', { name: 'Create question automation', exact: true })
    .click();
  const form = page.locator('form.automation-editor');
  await form.waitFor();
  assert(
    (await form.locator('[name="actionKind"]').inputValue()) ===
      'answer-questions',
    'the new automation keeps the question action'
  );
  const fields = form.locator('[data-answer-profile]');
  const importer = fields.locator(':scope > [data-profile-import]');
  await importer.locator(':scope > summary').click();
  await importer
    .getByLabel('Your contact details', { exact: true })
    .fill('Telegram: @second_owner');
  await importer
    .getByRole('button', { name: 'Preview profile fields', exact: true })
    .click();
  await importer
    .getByRole('checkbox', { name: 'telegram: @second_owner', exact: true })
    .check();
  await importer
    .getByRole('button', { name: 'Use selected fields', exact: true })
    .click();
  assert(
    (await fields.getByLabel('telegram', { exact: true }).inputValue()) ===
      '@second_owner',
    'the automation editor applies selected contacts'
  );
  assert(
    (await fields.getByLabel('email', { exact: true }).inputValue()) ===
      'newer-edit@example.test',
    'the automation editor retains other profile values'
  );
  assert(
    (await panel.getByLabel('telegram', { exact: true }).count()) === 0,
    'the separate question preview retains its own draft'
  );
};

const verifyProfileRecovery = async ({
  page,
  importer,
  fields,
  text,
  draft,
}) => {
  await page.route('**/api/automations/answers/profile', (route) =>
    fulfil(route, { error: 'Profile fixture refusal' }, 400)
  );
  await text.fill('Email: pending@example.test');
  await importer
    .getByRole('button', { name: 'Preview profile fields', exact: true })
    .click();
  await importer
    .getByRole('alert')
    .filter({ hasText: 'Profile fixture refusal' })
    .waitFor();
  assert(
    (await text.inputValue()) === 'Email: pending@example.test',
    'a failed read retains source edits'
  );
  assert(
    (await fields.getByLabel('email', { exact: true }).inputValue()) ===
      'contact-owner@example.test',
    'a failed read retains profile edits'
  );
  await page.unroute('**/api/automations/answers/profile');

  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  await page.route('**/api/automations/answers/profile', async (route) => {
    entered.resolve();
    await release.promise;
    await route.continue();
  });
  try {
    await importer
      .getByRole('button', { name: 'Preview profile fields', exact: true })
      .click();
    await entered.promise;
    await fields
      .getByLabel('email', { exact: true })
      .fill('newer-edit@example.test');
  } finally {
    release.resolve();
  }
  await importer
    .getByRole('alert')
    .filter({ hasText: 'Your draft changed while extracting.' })
    .waitFor();
  assert(
    (await fields.getByLabel('email', { exact: true }).inputValue()) ===
      'newer-edit@example.test',
    'a late read preserves newer edits'
  );
  await page.unroute('**/api/automations/answers/profile');
  await importer
    .getByRole('button', { name: 'Preview profile fields', exact: true })
    .click();
  await draft.waitFor();
};
