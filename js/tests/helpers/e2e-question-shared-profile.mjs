import { saveAnswerRule } from '../../src/automation/question-store.js';
import {
  saveAnswerProfile,
  readAnswerProfile,
} from '../../src/automation/question-profiles.js';
import { assert, fulfil } from './e2e-chat.mjs';
import { openQuestionPreview } from './question-preview.mjs';

const button = (root, name) => root.getByRole('button', { name, exact: true });
const addEmail = async (root, value) => {
  await root.getByLabel('Field name, e.g. city', { exact: true }).fill('email');
  await button(root, 'Add field').click();
  await root.getByLabel('email', { exact: true }).fill(value);
};

export const verifyQuestionSharedProfile = async ({ page, base, store }) => {
  await saveAnswerRule(store, {
    id: 'shared-browser',
    question: 'What is your email?',
    answers: [{ text: '{{email}}', approved: true, canonical: true }],
  });
  await page.goto(`${base}/?profile-check=shared#/automation`);
  const { panel, preview } = await openQuestionPreview(page);
  const fields = preview.locator(':scope > [data-answer-profile]');
  const shared = fields.locator('[data-shared-profile]');
  await shared.locator(':scope > summary').click();
  const editor = shared.locator('[data-shared-profile-editor]');
  await editor
    .getByLabel('Profile identifier', { exact: true })
    .fill('browser-owner');
  await editor
    .getByLabel('Profile name', { exact: true })
    .fill('Owner contacts');
  await addEmail(editor, 'first@example.test');
  await button(editor, 'Save profile').click();
  await shared
    .getByText('Profile saved. Linked automations use these current values.', {
      exact: true,
    })
    .waitFor();
  assert(
    (await shared
      .getByLabel('Linked profile', { exact: true })
      .inputValue()) === 'qa-profile:browser-owner',
    'saving links the profile explicitly'
  );
  const local = fields.locator(':scope > [data-profile-values]');
  assert(
    (await local.getByLabel('email', { exact: true }).count()) === 0,
    'saving leaves local overrides empty'
  );
  await preview
    .getByLabel('Question or pattern', { exact: true })
    .fill('What is your email?');
  await button(preview, 'Preview answer').click();
  const result = preview.locator('[data-answer-preview]');
  await result
    .locator('pre')
    .filter({ hasText: /^first@example.test$/u })
    .waitFor();
  await result.locator('[data-profile-evidence] > summary').click();
  assert(
    (await result.locator('[data-profile-evidence]').innerText()).includes(
      'qa-profile:browser-owner'
    ),
    'the result identifies its source'
  );
  await editor
    .getByLabel('email', { exact: true })
    .fill('current@example.test');
  await button(editor, 'Save profile').click();
  await shared
    .getByText('Profile saved. Linked automations use these current values.', {
      exact: true,
    })
    .waitFor();
  await button(preview, 'Preview answer').click();
  await result
    .locator('pre')
    .filter({ hasText: /^current@example.test$/u })
    .waitFor();
  await addEmail(local, 'override@example.test');
  await button(preview, 'Preview answer').click();
  await result
    .locator('pre')
    .filter({ hasText: /^override@example.test$/u })
    .waitFor();
  await result.getByText('Local overrides: email', { exact: true }).waitFor();
  await button(local, 'Remove field').click();
  await verifySharedProfileRecovery({ page, shared, editor, store });
  await button(shared, 'Read linked profile').click();
  await editor.getByLabel('email', { exact: true }).waitFor();
  await button(preview, 'Preview answer').click();
  await result
    .locator('pre')
    .filter({ hasText: /^external@example.test$/u })
    .waitFor();
  if (process.env.SHARED_PROFILE_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 1100 });
    await shared.evaluate((element) =>
      element.scrollIntoView({ block: 'start' })
    );
    await page.screenshot({
      path: process.env.SHARED_PROFILE_SCREENSHOT,
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await shared.evaluate((element) =>
    element.scrollIntoView({ block: 'start' })
  );
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  if (process.env.SHARED_PROFILE_MOBILE_SCREENSHOT) {
    await page.screenshot({
      path: process.env.SHARED_PROFILE_MOBILE_SCREENSHOT,
      scale: 'css',
    });
  }
  await verifySharedProfileAction({ page, panel, store });
};

const verifySharedProfileAction = async ({ page, panel, store }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await button(panel, 'Create question automation').click();
  const form = page.locator('form.automation-editor');
  await form.waitFor();
  const actionShared = form.locator('[data-shared-profile]');
  await actionShared.locator(':scope > summary').click();
  assert(
    (await actionShared
      .getByLabel('Linked profile', { exact: true })
      .inputValue()) === 'qa-profile:browser-owner',
    'creating an automation retains the reference'
  );
  await button(actionShared, 'Read linked profile').click();
  await actionShared
    .getByLabel('email', { exact: true })
    .fill('automation@example.test');
  await button(actionShared, 'Save profile').click();
  await actionShared
    .getByText('Profile saved. Linked automations use these current values.', {
      exact: true,
    })
    .waitFor();
  assert(
    (await readAnswerProfile(store, 'browser-owner')).values.email ===
      'automation@example.test',
    'both editors use the same profile storage'
  );
  await button(actionShared, 'Delete profile').click();
  await actionShared
    .getByText(
      'Profile deleted. Linked automations need a new profile reference.',
      { exact: true }
    )
    .waitFor();
  assert(
    (await actionShared
      .getByLabel('Linked profile', { exact: true })
      .inputValue()) === 'qa-profile:browser-owner',
    'deletion keeps the unresolved reference visible'
  );
  await button(actionShared, 'Read linked profile').click();
  await actionShared
    .getByRole('alert')
    .filter({ hasText: /is missing/u })
    .waitFor();
};

const verifySharedProfileRecovery = async ({ page, shared, editor, store }) => {
  await page.route('**/api/automations/answers/profiles/save', (route) =>
    fulfil(route, { error: 'Shared profile fixture refusal' }, 400)
  );
  await editor
    .getByLabel('email', { exact: true })
    .fill('pending@example.test');
  await button(editor, 'Save profile').click();
  await shared
    .getByRole('alert')
    .filter({ hasText: 'Shared profile fixture refusal' })
    .waitFor();
  assert(
    (await editor.getByLabel('email', { exact: true }).inputValue()) ===
      'pending@example.test',
    'a failed save preserves pending edits'
  );
  assert(
    (await readAnswerProfile(store, 'browser-owner')).values.email ===
      'current@example.test',
    'a failed save never changes the saved profile'
  );
  await page.unroute('**/api/automations/answers/profiles/save');
  const current = await readAnswerProfile(store, 'browser-owner');
  await saveAnswerProfile(store, {
    ...current,
    values: { email: 'external@example.test' },
  });
  await button(editor, 'Save profile').click();
  await shared
    .getByRole('alert')
    .filter({ hasText: 'Named answer profile changed' })
    .waitFor();
  assert(
    (await editor.getByLabel('email', { exact: true }).inputValue()) ===
      'pending@example.test',
    'a stale save preserves pending edits for review'
  );
  assert(
    (await readAnswerProfile(store, 'browser-owner')).values.email ===
      'external@example.test',
    'a stale save preserves the other writer'
  );
};
