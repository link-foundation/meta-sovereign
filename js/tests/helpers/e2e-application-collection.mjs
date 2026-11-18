import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { applicationRouteApi } from './application-controls.mjs';
import { LINO_TEXT } from '../../src/transport/lino.js';
import { vacancySnapshot } from '../../src/assignments/vacancy.js';
import { publishedWebBundle } from '../../../experiments/issue-56/published-web-bundle.mjs';
import { applicationInput } from '../../../experiments/issue-56/application-fixture.mjs';

/** Real native form and shared UI; collection off must preserve the old cache. */
export const verifyNativeApplicationCollection = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await applicationNativeFixture(browser);
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'collection');
  try {
    if (before) {
      const body = await publishedWebBundle('d48a6179', [
        'js/src/web/application-panel.js',
        'js/src/web/application-state.js',
      ]);
      await page.route('**/app.min.js', (route) =>
        route.fulfill({
          contentType: 'text/javascript',
          body,
        })
      );
    }
    await controls.select();
    const check = panel.locator('[data-application-option="collectVacancies"]');
    if (before) {
      await shot('before');
    }
    assert.equal(
      await check.count(),
      1,
      'Persistent collection opt-out is missing'
    );
    assert.equal(await check.isChecked(), true);
    await check.uncheck();
    const saved = (await fixture.store.query()).find((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    const previous = { ...saved, title: 'Previously saved by the owner' };
    await fixture.store.put(previous);
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await panel.locator('[data-application-collection="memory"]').waitFor();
    await panel
      .locator('[data-application-description]')
      .filter({ hasText: 'Employer’s final paragraph stays intact.' })
      .waitFor();
    const row = (await fixture.store.query()).find((value) =>
      value.id.startsWith('secret:jobs-application:')
    );
    assert.equal(row.options.collectVacancies, false);
    assert.equal(row.vacancy, null);
    assert.deepEqual(await fixture.store.get(previous.id), previous);
    const input = {
      ...applicationInput,
      requestId: row.requestId,
      collectVacancies: false,
    };
    const api = applicationRouteApi(fixture.base, LINO_TEXT);
    const status = await api.vacancyApplicationStatus(input);
    assert.equal(status.vacancy.title, 'Python engineer');
    await shot('after');
    await controls.confirmed('enter');
    await panel.locator('[data-application-state="review"]').waitFor();
    const owned = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((candidate) =>
        candidate.url().startsWith('https://hh.ru/applicant/vacancy_response')
      );
    assert(owned);
    await owned
      .locator('#experience')
      .fill('Actual owner answer stays in this form.');
    const read = page.waitForResponse((response) =>
      response.url().endsWith('/api/vacancies/application-read')
    );
    await action('read').click();
    assert.equal((await read).status(), 200);
    await page.waitForFunction(
      () =>
        !document.querySelector('[data-application-action="recover"]').disabled
    );
    assert.equal(
      await owned.locator('#experience').inputValue(),
      'Actual owner answer stays in this form.'
    );
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    await controls.locales('[data-application-collection="memory"]');
    await controls.phone();
    await shot('phone');
    await controls.close(owned);
    const context = await vacancySnapshot(
      fixture.runtimeStore,
      () => assert.fail('reuse run context without another browser'),
      input.url,
      false
    );
    assert.equal(context.title, status.vacancy.title);
    assert.deepEqual(await fixture.store.get(previous.id), previous);
    const offline = await api.vacancyApplicationStatus(input);
    assert.equal(offline.active, false);
    assert.equal(offline.vacancy, null);
    assert.equal(offline.collectVacancies, false);
    await shot('closed');
    await page.reload();
    await panel.waitFor();
    assert.equal(
      await panel.locator('[data-application-description]').count(),
      0
    );
    assert(fixture.records.every((value) => value.closed));
    return {
      collection: false,
      durableVacancy: false,
      existingCacheUnchanged: true,
      fullContextInRun: true,
      locales: 4,
      nativeEntries: 1,
      submissions: 0,
      ownerAnswerPreserved: true,
      offlineContext: null,
      opens: fixture.records.length,
      allBrowsersClosed: fixture.records.every((value) => value.closed),
      errors: fixture.errors,
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
