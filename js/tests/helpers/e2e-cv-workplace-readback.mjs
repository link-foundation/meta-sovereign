import assert from 'node:assert/strict';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { cvSaveAttempt } from '../../src/jobs/cv-watch-verification.js';
import { cvWatchWorkplaceHtml } from '../../../experiments/issue-56/cv-watch-workplace-fixture.mjs';

/** Exercise the production inert DOM reader in the same real native engine. */
export const verifyCvWorkplaceReadbackDocument = async (provider, url) => {
  const html = cvWatchWorkplaceHtml({ secondary: true });
  const raw = await provider.evaluate(readCvEditorDocument, { html, url });
  const record = cvSaveAttempt(raw);
  assert.equal(record.recordId, '123');
  assert.deepEqual(record.resumes, [
    { hash: 'abc123', checked: true },
    { hash: 'russian', checked: false },
  ]);
  for (const document of [
    html.replace('</body>', '<input name="company" value="Duplicate"></body>'),
    html.replace('checkbox-russian"', 'checkbox-russian" hidden'),
    html.replace(
      'type="checkbox" data-qa="profile-resumes-list-checkbox-russian"',
      'type="text" data-qa="profile-resumes-list-checkbox-russian"'
    ),
    html.replace(
      'resume-editor-experience-description-input',
      'missing-description'
    ),
    html.replace(
      'resume-editor-experience-present-checkbox',
      'missing-current'
    ),
    '<input name="captcha">',
  ]) {
    const result = await provider.evaluate(readCvEditorDocument, {
      html: document,
      url,
    });
    assert.notEqual(result?.kind, 'workplace');
  }
};

export const verifyCvWorkplaceRecovery = async ({
  page,
  view,
  status,
  capture,
}) => {
  await view.locator('[data-cv-saved-snapshot] > summary').click();
  await capture('cv-save-watch-workplace.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await status('saved');
  const evidence = view.locator('[data-cv-workplace-evidence="123"]');
  assert.equal(await evidence.count(), 1);
  await view.locator('select').nth(1).selectOption('russian');
  await evidence.filter({ hasText: 'Excluded from this CV' }).waitFor();
  await capture('cv-workplace-identity-phone.png', evidence);
  await page.setViewportSize({ width: 1280, height: 900 });
};
