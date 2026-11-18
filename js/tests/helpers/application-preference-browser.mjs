import assert from 'node:assert/strict';
import { join } from 'node:path';

export const verifyApplicationPreferenceBrowser = async (
  panel,
  screenshots,
  before = false
) => {
  // Historical parent probes keep their own expected missing-control boundary.
  if (
    before ||
    process.env.APPLICATION_CONTEXT_BEFORE === '1' ||
    process.env.APPLICATION_FULLFORM_BEFORE === '1'
  ) {
    return;
  }
  const saved = panel.locator('[data-application-resume-preference="manual"]');
  if (process.env.APPLICATION_PREFERENCE_BEFORE === '1' && screenshots) {
    await panel
      .locator('[data-application-resume-title]')
      .locator('..')
      .screenshot({
        path: join(screenshots, 'application-preference-before.png'),
      });
  }
  assert.equal(await saved.count(), 1, 'Saved resume preference is missing.');
  assert((await saved.innerText()).includes('Senior Software Engineer'));
  if (screenshots) {
    await panel
      .locator('[data-application-resume-title]')
      .locator('..')
      .screenshot({
        path: join(screenshots, 'application-preference-after.png'),
      });
  }
};
