import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { changeExternalSkipNotice } from '../../../experiments/issue-56/vacancy-skip-dom.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import {
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';
import { wirePost } from './vacancy-routes.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';

export const verifyNativeVacancySkips = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const fixture = await applicationNativeFixture(browser);
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const vacancies = page.locator('[data-vacancies]');
  const skipped = vacancies.locator('[data-vacancy-skips="jobs"]');
  const shot = async (name, target = skipped) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await target.screenshot({
        path: join(screenshots, `vacancy-skips-${name}.png`),
      });
    }
  };
  try {
    await controls.select();
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await controls.confirmed('enter');
    const owned = nativeApplicationForm(browser);
    await owned
      .locator('#experience')
      .fill('Owner experience remains unchanged.');
    for (const kind of [
      'hidden',
      'ambiguous',
      'unsafe',
      'provider',
      'credentials',
      'valid',
    ]) {
      await owned.evaluate(changeExternalSkipNotice, kind);
      const snapshot = await owned
        .locator('#native-form')
        .evaluate(applicationDocument, {
          url: applicationInput.url,
          selectors: applicationSelectors,
        });
      assert.equal(snapshot.external, kind !== 'hidden');
      if (!before) {
        assert.equal(
          snapshot.externalUrl,
          kind === 'valid' ? 'https://employer.example/apply' : null,
          kind
        );
      }
    }
    await controls.confirmed('read');
    await panel.locator('[data-application-state="external"]').waitFor();
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Owner experience remains unchanged.'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await controls.close(owned);
    await page.reload();
    await vacancies.waitFor();
    if (before) {
      await shot('before', vacancies);
    }
    assert.equal(
      await skipped.count(),
      1,
      'persisted refusal controls must survive a page reload'
    );
    const row = skipped.locator(
      `[data-vacancy-skip="${applicationInput.url}"]`
    );
    await row.waitFor();
    assert.equal(
      await row.locator('a').nth(1).getAttribute('href'),
      'https://employer.example/apply'
    );
    await shot('after');
    await controls.phone();
    await shot('phone');
    await page.setViewportSize({ width: 1280, height: 900 });
    await vacancies.locator('[data-vacancy-action="search"]').click();
    await vacancies.locator('[data-vacancy-selection="native-skip"]').waitFor();
    const refused = await wirePost(
      fixture.base,
      'application-open',
      applicationInput,
      LINO_TEXT
    );
    assert.equal(refused.status, 409);
    assert.equal(refused.value.code, 'jobs-application-skipped');
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (value) =>
          globalThis.localStorage.setItem('metaSovereignLocale', value),
        locale
      );
      await page.reload();
      await row.waitFor();
      assert.doesNotMatch(await skipped.innerText(), /vacancySkip\./u);
    }
    await skipped
      .locator('[data-vacancy-skip-action="clear-external_site"]')
      .click();
    await row.waitFor({ state: 'detached' });
    await page.reload();
    await skipped.locator('[data-vacancy-skip-empty]').waitFor();
    assert.equal(await skipped.locator('[data-vacancy-skip]').count(), 0);
    assert(fixture.records.every((record) => record.closed));
    assert.deepEqual(fixture.errors, []);
    return {
      linkVariants: 6,
      reloadPreserved: true,
      refusedNewOpen: true,
      translatedLocales: 4,
      clearPersisted: true,
      providerSubmissions: 0,
      browsersClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
