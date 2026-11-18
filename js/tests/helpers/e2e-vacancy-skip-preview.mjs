import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { changeExternalSkipNotice } from '../../../experiments/issue-56/vacancy-skip-dom.mjs';
import { changeResumeVisibilityWarning } from '../../../experiments/issue-56/application-resume-visibility-dom.mjs';
import { changeUnavailableWarning } from '../../../experiments/issue-56/application-unavailable-dom.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';
import { vacancySkipId } from '../../src/jobs/vacancy-skip-data.js';

/** Three finite native refusals in isolated preview owners; never a provider send. */
export const verifyNativeVacancySkipPreview = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const cases = [
    ['external', changeExternalSkipNotice, 'valid'],
    ['resume-not-visible', changeResumeVisibilityWarning, 'visible'],
    ['vacancy-unavailable', changeUnavailableWarning, 'english'],
  ];
  for (const [state, change, kind] of cases) {
    const fixture = await applicationNativeFixture(browser, { popup: true });
    const controls = applicationPanelBrowser(fixture);
    const { page, panel, action } = controls;
    const shot = async (name) => {
      if (screenshots && state === 'external') {
        await mkdir(screenshots, { recursive: true });
        await page.locator('[data-vacancy-skips="jobs"]').screenshot({
          path: join(screenshots, `preview-skips-${name}.png`),
        });
      }
    };
    try {
      await controls.select();
      await panel.locator('[data-application-option="testMode"]').check();
      await action('start').click();
      await panel.locator('[data-application-state="ready"]').waitFor();
      const owned = nativeApplicationForm(browser, applicationInput.url);
      // Render a provider form without issuing the preview's entry action.
      await owned.evaluate(() => globalThis.openApplication(false));
      await owned.locator('#experience').fill('Owner preview answer');
      await owned.evaluate(change, kind);
      await controls.confirmed('read');
      await panel.locator(`[data-application-state="${state}"]`).waitFor();
      assert.equal(
        await owned.locator('#experience').inputValue(),
        'Owner preview answer'
      );
      assert.equal(
        await owned.evaluate(() => globalThis.applicationEntries),
        0
      );
      assert.equal(
        await owned.evaluate(() => globalThis.applicationAttempts),
        0
      );
      if (state === 'external' && !before) {
        await controls.locales('[data-application-state="external"]');
      }
      await controls.close(owned);
      await page.reload();
      const skips = page.locator('[data-vacancy-skips="jobs"]');
      await skips.waitFor();
      await shot(before ? 'before' : 'after');
      assert.equal(
        (await fixture.store.get(vacancySkipId('jobs'))) ?? null,
        null,
        'preview must not create permanent refusals'
      );
      await skips.locator('[data-vacancy-skip-empty]').waitFor();
      if (state === 'external') {
        await controls.phone();
        await shot('phone');
      }
      assert(fixture.records.every((record) => record.closed));
      assert.deepEqual(fixture.errors, []);
    } finally {
      await fixture.close();
    }
  }
  return {
    refusalReasons: cases.length,
    previewLedgerUnchanged: true,
    ownerValuesPreserved: true,
    reloadRetained: true,
    locales: 4,
    providerEntries: 0,
    providerSubmissions: 0,
    browsersClosed: true,
    liveProvider: false,
  };
};
