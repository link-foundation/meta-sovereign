import { readAnswerProfile } from '../../src/automation/question-profiles.js';
import { assert, fulfil } from './e2e-chat.mjs';

const button = (root, name) => root.getByRole('button', { name, exact: true });
const legacy =
  'email\n  legacy@example.test\ngithub\n  github.com/example\n  github.com/example-org\nwebsite\n  https://example.test/unquoted\n';

export const verifyQuestionLegacyProfile = async ({ page, base, store }) => {
  await page.goto(`${base}/?profile-check=legacy#/automation`);
  const panel = page.locator('[data-question-controls]');
  await panel.locator(':scope > summary').click();
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: /^Preview answer$/u }),
  });
  await preview.locator(':scope > summary').click();
  const fields = preview.locator(':scope > [data-answer-profile]');
  const shared = fields.locator('[data-shared-profile]');
  await shared.locator(':scope > summary').click();
  const editor = shared.locator('[data-shared-profile-editor]');
  await editor
    .getByLabel('Profile identifier', { exact: true })
    .fill('legacy-owner');
  await editor.getByLabel('Profile name', { exact: true }).fill('Legacy owner');
  const values = editor.locator(':scope > [data-profile-values]');
  await values
    .getByLabel('Field name, e.g. city', { exact: true })
    .fill('email');
  await button(values, 'Add field').click();
  await values
    .getByLabel('email', { exact: true })
    .fill('current@example.test');
  const importer = editor.locator(':scope > [data-profile-import]');
  assert(
    (await importer.count()) === 1,
    'a reusable profile has an explicit source importer'
  );
  await importer.locator(':scope > summary').click();
  await importer
    .getByLabel('Contact text format', { exact: true })
    .selectOption('contacts-lino');
  await importer
    .getByLabel('Your contact details', { exact: true })
    .fill(legacy);
  await button(importer, 'Preview profile fields').click();
  const draft = importer.locator('[data-profile-draft]');
  await draft
    .getByRole('checkbox', { name: 'email: legacy@example.test', exact: true })
    .waitFor();
  assert(
    await button(importer, 'Use selected fields').isDisabled(),
    'legacy preview selects nothing implicitly'
  );
  assert(
    (await values.getByLabel('email', { exact: true }).inputValue()) ===
      'current@example.test',
    'preview preserves the existing staged contact'
  );
  assert(
    !(await store.get('qa-profile:legacy-owner')),
    'preview does not save the named profile'
  );
  await draft.locator('[data-profile-skipped] > summary').click();
  await draft.getByText(/quote values containing a colon/u).waitFor();
  await draft
    .getByRole('checkbox', { name: 'email: legacy@example.test', exact: true })
    .check();
  await screenshotLegacy({ page, importer });
  await button(importer, 'Use selected fields').click();
  assert(
    (await values.getByLabel('email', { exact: true }).inputValue()) ===
      'legacy@example.test',
    'only the selected contact is applied'
  );
  assert(
    (await values.getByLabel('github', { exact: true }).count()) === 0,
    'an unselected list stays unapplied'
  );
  await verifyLegacyRecovery({ page, importer, values });
  await button(editor, 'Save profile').click();
  await shared
    .getByText('Profile saved. Linked automations use these current values.', {
      exact: true,
    })
    .waitFor();
  assert(
    (await readAnswerProfile(store, 'legacy-owner')).values.email ===
      'edited@example.test',
    'an explicit save persists reviewed current values'
  );
  await verifyLocalLegacy(fields, store);
  await button(panel, 'Create question automation').click();
  const form = page.locator('form.automation-editor');
  await form.waitFor();
  await verifyLocalLegacy(form.locator('[data-answer-profile]'), store);
};

const screenshotLegacy = async ({ page, importer }) => {
  for (const [width, height, variable] of [
    [1200, 1100, 'LEGACY_PROFILE_SCREENSHOT'],
    [390, 844, 'LEGACY_PROFILE_MOBILE_SCREENSHOT'],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          globalThis.requestAnimationFrame(() =>
            globalThis.requestAnimationFrame(resolve)
          )
        )
    );
    const target =
      width < 500 ? importer.locator('[data-profile-draft]') : importer;
    await target.evaluate((element) => {
      element.style.scrollMarginTop = '72px';
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    await page.waitForFunction(
      (element) => {
        const top = element.getBoundingClientRect().top;
        return top >= 56 && top < 200;
      },
      await target.elementHandle()
    );
    await page.waitForFunction(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    if (process.env[variable]) {
      await page.screenshot({ path: process.env[variable], scale: 'css' });
    }
  }
  await page.setViewportSize({ width: 1200, height: 1000 });
};

const verifyLegacyRecovery = async ({ page, importer, values }) => {
  await page.route('**/api/automations/answers/profile', (route) =>
    fulfil(route, { error: 'Legacy fixture refusal' }, 400)
  );
  await button(importer, 'Preview profile fields').click();
  await importer
    .getByRole('alert')
    .filter({ hasText: 'Legacy fixture refusal' })
    .waitFor();
  assert(
    (await importer
      .getByLabel('Your contact details', { exact: true })
      .inputValue()) === legacy,
    'refusal preserves the source'
  );
  assert(
    (await values.getByLabel('email', { exact: true }).inputValue()) ===
      'legacy@example.test',
    'refusal preserves staged values'
  );
  await page.unroute('**/api/automations/answers/profile');
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let requested;
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  await page.route('**/api/automations/answers/profile', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await button(importer, 'Preview profile fields').click();
  try {
    await started;
    await values
      .getByLabel('email', { exact: true })
      .fill('edited@example.test');
  } finally {
    release();
  }
  await importer
    .getByRole('alert')
    .filter({ hasText: 'Your draft changed while extracting' })
    .waitFor();
  await page.unroute('**/api/automations/answers/profile');
  await button(importer, 'Preview profile fields').click();
  await importer.locator('[data-profile-draft]').waitFor();
  assert(
    (await values.getByLabel('email', { exact: true }).inputValue()) ===
      'edited@example.test',
    'fresh retry preserves the newer staged value'
  );
};

const verifyLocalLegacy = async (fields, store) => {
  const importer = fields.locator(':scope > [data-profile-import]');
  await importer.locator(':scope > summary').click();
  await importer
    .getByLabel('Contact text format', { exact: true })
    .selectOption('contacts-lino');
  await importer
    .getByLabel('Your contact details', { exact: true })
    .fill('location\n  Hanoi\n');
  await button(importer, 'Preview profile fields').click();
  await importer
    .getByRole('checkbox', { name: 'location: Hanoi', exact: true })
    .check();
  await button(importer, 'Use selected fields').click();
  assert(
    (await fields
      .locator(':scope > [data-profile-values]')
      .getByLabel('location', { exact: true })
      .inputValue()) === 'Hanoi',
    'legacy fields also apply to local action overrides'
  );
  assert(
    (await readAnswerProfile(store, 'legacy-owner')).values.location ===
      undefined,
    'local import does not update the linked profile'
  );
};
