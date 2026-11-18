import {
  resumeCv,
  resumeMarkdown,
  githubLinks,
} from '../../../experiments/issue-56/resume-profile-fixture.mjs';
import { assert } from './e2e-chat.mjs';
import { profileNavigationTrace } from './e2e-profile-navigation-trace.mjs';

const verifyCvContacts = async (draft) => {
  for (const [label, message] of [
    ['birthDate: 1990-03-02', 'canonical birth date is offered for review'],
    [
      `github: ${githubLinks}`,
      'canonical GitHub links remain one contact list',
    ],
    [
      `resume: ${resumeCv.url}`,
      'the actual CV URL is offered as the résumé contact',
    ],
  ]) {
    assert(
      (await draft
        .getByRole('checkbox', { name: label, exact: true })
        .count()) === 1,
      message
    );
  }
};

const openResumeProfile = async (page, base, panel) => {
  const trace = profileNavigationTrace(page);
  await trace('before-navigation');
  await page.goto(`${base}/#/automation`);
  await trace('after-navigation');
  const rootOpen = (await panel.getAttribute('open')) !== null;
  await trace('root-state', { observedOpen: rootOpen });
  if (!rootOpen) {
    await panel.locator(':scope > summary').click();
    await trace('root-click');
  }
  const preview = panel.locator('details').filter({
    has: page.locator(':scope > summary', { hasText: 'Preview answer' }),
  });
  const previewOpen = (await preview.getAttribute('open')) !== null;
  await trace('preview-state', { observedOpen: previewOpen });
  if (!previewOpen) {
    await preview.locator(':scope > summary').click();
    await trace('preview-click');
  }
  return preview;
};

export const verifyResumeProfile = async ({ page, base, panel, store }) => {
  await store.put(resumeCv);
  const before = await store.query(() => true);
  const preview = await openResumeProfile(page, base, panel);
  const fields = preview.locator(':scope > [data-answer-profile]');
  const importer = fields.locator(':scope > [data-profile-import]');
  await importer.locator(':scope > summary').click();
  await importer
    .getByRole('button', { name: 'Load saved CVs', exact: true })
    .click();
  await importer.getByText('Saved CVs loaded.', { exact: true }).waitFor();
  await importer
    .getByLabel('Saved CV snapshot', { exact: true })
    .selectOption(resumeCv.id);
  const previewFields = () =>
    importer
      .getByRole('button', { name: 'Preview profile fields', exact: true })
      .click();
  await previewFields();
  const draft = importer.locator('[data-profile-draft]');
  await draft.waitFor();
  if (process.env.RESUME_PROFILE_BEFORE === '1') {
    await importer.evaluate((element) =>
      element.scrollIntoView({ block: 'start' })
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-resume-profile-before.png',
      scale: 'css',
    });
  }
  await verifyCvContacts(draft);
  if (process.env.RESUME_PROFILE_SCREENSHOTS === '1') {
    await importer.evaluate((element) =>
      element.scrollIntoView({ block: 'start' })
    );
    await page.screenshot({
      path: 'docs/screenshots/issue-56-resume-profile-cv-after.png',
      scale: 'css',
    });
  }
  await importer
    .getByLabel('Saved CV snapshot', { exact: true })
    .selectOption('');
  await importer
    .getByLabel('Contact text format', { exact: true })
    .selectOption('resume-markdown');
  await importer
    .getByLabel('Your contact details', { exact: true })
    .fill(resumeMarkdown);
  await previewFields();
  await draft.waitFor();
  assert(
    await importer
      .getByRole('button', { name: 'Use selected fields', exact: true })
      .isDisabled(),
    'résumé extraction selects no contacts implicitly'
  );
  const keys = [];
  for (const box of await draft.getByRole('checkbox').all()) {
    keys.push((await box.getAttribute('aria-label')).split(':')[0]);
    await box.check();
  }
  assert(
    keys.length === 10,
    'the Markdown header offers all ten expected owner fields'
  );
  assert(
    (await draft.getByText('text · line:5', { exact: true }).count()) === 1,
    'the birth date keeps its original Markdown line'
  );
  assert(
    (await draft.getByText('company@example.test', { exact: true }).count()) ===
      0,
    'work experience contacts are excluded'
  );
  if (process.env.RESUME_PROFILE_SCREENSHOTS === '1') {
    await draft
      .getByRole('checkbox', { name: `github: ${githubLinks}`, exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: 'docs/screenshots/issue-56-resume-profile-after.png',
      scale: 'css',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1
  );
  if (process.env.RESUME_PROFILE_SCREENSHOTS === '1') {
    await draft
      .getByRole('checkbox', { name: `github: ${githubLinks}`, exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: 'docs/screenshots/issue-56-resume-profile-mobile.png',
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
  const values = fields.locator(':scope > [data-profile-values]');
  assert(
    (await values.getByLabel('github', { exact: true }).inputValue()) ===
      githubLinks,
    'the selected draft keeps both GitHub links'
  );
  assert(
    (await values.getByLabel('birthDate', { exact: true }).inputValue()) ===
      '1990-03-02',
    'the selected birth date is usable by date inputs'
  );
  assert(
    JSON.stringify(await store.query(() => true)) === JSON.stringify(before),
    'neither source preview nor draft selection writes storage'
  );
  console.log(
    `[resume-profile] ${JSON.stringify({ keys, github: githubLinks, birthDate: '1990-03-02', readOnly: true, mobileOverflow: false })}`
  );
  await page.setViewportSize({ width: 1200, height: 800 });
};
