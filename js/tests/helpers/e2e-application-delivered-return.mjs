import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { originalApplicationSearch } from '../../../experiments/issue-56/application-search-route-fixture.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';

export const verifyNativeApplicationDeliveredReturn = async (
  browser,
  { before = false, screenshots, webBundle } = {}
) => {
  const searchVisits = [];
  const vacancy = 'https://hh.ru/vacancy/123';
  const fixture = await applicationNativeFixture(browser, {
    ownerAnswers: {
      experience: 'Reviewed experience',
      letter: 'Reviewed letter',
    },
    searchRoute: async (route, url) => {
      if (url.href !== originalApplicationSearch) {
        return false;
      }
      searchVisits.push(url.href);
      await route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<h1>Python vacancies</h1><label>Search <input value="Python"></label>
          <article><a data-qa="serp-item__title" href="/vacancy/456">Another Python vacancy</a></article>`,
      });
      return true;
    },
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'application-delivered-return');
  if (webBundle) {
    await page.route(`${fixture.base}/app.min.js`, (route) =>
      route.fulfill({ path: webBundle, contentType: 'text/javascript' })
    );
  }
  try {
    await controls.select();
    await panel
      .locator('[data-application-option="applyFromVacancyPage"]')
      .uncheck();
    await panel
      .locator('[data-application-option="applicationSearchUrl"]')
      .fill(originalApplicationSearch);
    await panel
      .locator('[data-application-option="vacancyPreviewSeconds"]')
      .fill('0');
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    const owned = nativeApplicationForm(browser, vacancy);
    if (!before) {
      assert.equal(
        await action('enter').innerText(),
        'Open the application from the original search'
      );
    }
    await controls.confirmed('enter');
    await panel.locator('[data-application-state="review"]').waitFor();
    assert.deepEqual(searchVisits, [originalApplicationSearch]);
    await controls.confirmed('submit');
    const receipt = panel.locator(
      '[data-application-delivery="provider-confirmed"]'
    );
    await receipt.waitFor();
    if (before) {
      await shot('before', panel);
      await shot('native-before', owned.locator('body'));
    }
    assert.equal(
      owned.url(),
      originalApplicationSearch,
      'Delivered review stayed on the native response page'
    );
    assert.deepEqual(searchVisits, [
      originalApplicationSearch,
      originalApplicationSearch,
    ]);
    assert.equal(
      await owned.evaluate(() =>
        globalThis.sessionStorage.getItem('fixture-application-sends')
      ),
      '1'
    );
    assert.equal(
      await owned.getByRole('link', { name: 'Another Python vacancy' }).count(),
      1
    );
    const open = panel.locator('[data-application-search-open]');
    await open.waitFor();
    await shot('after', panel);
    await shot('native-after', owned.locator('body'));
    await page.reload();
    await receipt.waitFor();
    await open.waitFor();
    await action('read').click();
    await open.waitFor();
    assert.equal(searchVisits.length, 2);
    await controls.close(owned);
    return {
      sends: 1,
      exactSearchVisits: searchVisits.length,
      receiptRecovered: true,
      resourcesClosed: true,
    };
  } finally {
    await fixture.close();
  }
};
