import assert from 'node:assert/strict';
import { join } from 'node:path';

/** Explicit context confirmation preserves owner edits and skips an already correct menu. */
export const verifyApplicationContextBrowser = async (
  controls,
  owned,
  screenshots
) => {
  const { panel, action } = controls;
  await owned.locator('#experience').evaluate((node) => {
    node.parentElement.firstChild.textContent =
      'Расскажите о вашем последнем опыте работы';
  });
  await action('read').click();
  if (process.env.APPLICATION_CONTEXT_BEFORE === '1' && screenshots) {
    await panel
      .locator('[data-application-resume-title]')
      .locator('..')
      .screenshot({
        path: join(screenshots, 'application-context-before.png'),
      });
  }
  assert.equal(
    await action('context-resume').count(),
    1,
    'Contextual resume choice is missing.'
  );
  await panel
    .locator('[data-application-resume-context]')
    .filter({ hasText: 'RU' })
    .waitFor();
  assert.equal(await action('context-resume').isDisabled(), true);
  await controls.confirmed('context-resume');
  assert.equal(await owned.evaluate(() => globalThis.resumeMenus), 1);
  assert.equal(await owned.evaluate(() => globalThis.resumeChoices), 1);
  // A later owner choice is changed only by this new, explicit contextual confirmation.
  await owned.locator('[data-qa="resume-title"]').first().click();
  await owned
    .locator('[role="option"][data-qa="magritte-select-option-russian-old"]')
    .click();
  await action('read').click();
  await panel
    .locator('[data-application-resume-title]')
    .filter({ hasText: 'Старое резюме' })
    .waitFor();
  await controls.confirmed('context-resume');
  await panel.locator('[data-application-resume-proof="ru"]').waitFor();
  assert.equal(
    await owned.locator('input[name="native-resume"]:checked').inputValue(),
    'english'
  );
  assert.equal(
    await owned.locator('#experience').inputValue(),
    'Owner answer retained.'
  );
  assert.equal(
    await owned
      .locator('[data-qa="vacancy-response-form-letter-input"]')
      .inputValue(),
    'Owner letter retained.'
  );
  assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
  if (screenshots) {
    await panel
      .locator('[data-application-resume-title]')
      .locator('..')
      .screenshot({
        path: join(screenshots, 'application-context-after.png'),
      });
  }
  await action('read').click();
  await panel
    .locator('[data-application-resume-context]')
    .filter({ hasText: 'RU' })
    .waitFor();
  assert.equal(await action('submit').isDisabled(), true);
  return {
    language: 'ru',
    reason: 'questions',
    checkedHash: 'english',
    passiveMenuClicks: 0,
    sends: 0,
  };
};
