import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { originalApplicationSearch } from '../../../experiments/issue-56/application-search-route-fixture.mjs';
import { routePublishedWebBundle } from '../../../experiments/issue-56/published-web-bundle.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import {
  nativeApplicationForm,
  assertNativeApplicationAnswers,
} from './application-native-request.mjs';
import {
  applicationSearchPage,
  applicationDocument,
  applicationSelectors,
} from '../../src/jobs/application-page.js';

const refuseSearchChanges = async (browser, record) => {
  const page = browser.page;
  const snapshot = await applicationSearchPage(browser, record);
  const input = {
    url: record.url,
    selectors: applicationSelectors,
    searchUrl: record.options.applicationSearchUrl,
    action: 'searchForm',
    guard: JSON.stringify(snapshot),
  };
  for (const kind of [
    'challenge',
    'draft',
    'changed-fields',
    'changed-document',
  ]) {
    if (kind !== 'changed-document') {
      await page.evaluate((name) => {
        const node = document.createElement(
          name === 'draft' ? 'textarea' : 'input'
        );
        node.id = 'route-refusal';
        if (name === 'challenge') {
          node.name = 'captcha';
        } else {
          node.value = 'Owner edited the search or application';
        }
        document.body.append(node);
      }, kind);
    }
    try {
      const guard =
        kind === 'changed-document'
          ? input.guard.replace(snapshot.documentKey, 'unreviewed-document')
          : input.guard;
      const result = await browser.commander.evaluate({
        fn: applicationDocument,
        args: [null, { ...input, guard }],
      });
      assert.equal(result.navigated, false, kind);
      assert.equal(page.url(), record.options.applicationSearchUrl);
    } finally {
      await page.evaluate(() =>
        document.querySelector('#route-refusal')?.remove()
      );
    }
  }
  return 4;
};

/** Both actual native routes and owner edits, with no provider requests. */
export const verifyNativeApplicationSearchRoute = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const results = [];
  for (const direct of before ? [true] : [true, false]) {
    let nativeRefusals = 0;
    const fixture = await applicationNativeFixture(browser, {
      ownerAnswers: {
        experience: 'Actual owner answer',
        letter: 'Actual owner letter',
      },
      application: {
        searchPage: async (session, record, guard) => {
          if (guard === undefined) {
            nativeRefusals += await refuseSearchChanges(session, record);
          }
          return applicationSearchPage(session, record, guard);
        },
      },
    });
    const controls = applicationPanelBrowser(fixture);
    const { page, panel, action } = controls;
    const shot = controls.screenshot(screenshots, 'application-route');
    try {
      if (before) {
        await routePublishedWebBundle(page, 'ef34179a', [
          'js/src/web/application-panel.js',
          'js/src/web/application-state.js',
        ]);
      }
      await controls.select();
      const route = panel.locator(
        '[data-application-option="applyFromVacancyPage"]'
      );
      if (before) {
        await shot('before');
        assert.equal(await route.count(), 0);
        return { missingRouteOption: true, liveProvider: false };
      }
      assert.equal(await route.isChecked(), true);
      await panel
        .locator('[data-application-option="vacancyPreviewSeconds"]')
        .fill('0');
      if (!direct) {
        await route.uncheck();
        await panel
          .locator('[data-application-option="applicationSearchUrl"]')
          .fill(originalApplicationSearch);
        await shot('settings');
      }
      await action('start').click();
      await panel.locator('[data-application-state="ready"]').waitFor();
      const owned = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
      const visited = [owned.url()];
      owned.on('framenavigated', (frame) => {
        if (frame === owned.mainFrame()) {
          visited.push(frame.url());
        }
      });
      await controls.confirmed(direct ? 'form' : 'enter');
      await panel.locator('[data-application-state="review"]').waitFor();
      assert.equal(visited.length, direct ? 2 : 3);
      if (!direct) {
        assert.equal(visited[1], originalApplicationSearch);
      }
      assert(
        visited
          .at(-1)
          .includes(
            '/applicant/vacancy_response?vacancyId=123&startedWithQuestion=false'
          )
      );
      await assertNativeApplicationAnswers(owned, {
        experience: 'Actual owner answer',
        letter: 'Actual owner letter',
      });
      assert.equal(
        await owned.evaluate(
          () => globalThis.applicationEntries + globalThis.applicationAttempts
        ),
        0
      );
      assert.equal(nativeRefusals, direct ? 0 : 4);
      const saved = (await fixture.store.query()).find((row) =>
        row.id.startsWith('secret:jobs-application:')
      );
      assert.equal(saved.options.applyFromVacancyPage, direct);
      assert.deepEqual(saved.attempted, { enter: false, submit: false });
      if (!direct) {
        await shot('after');
        await controls.locales(
          '[data-application-route="search"]',
          async (locale) => shot(locale)
        );
        await controls.phone();
        await shot('phone');
      }
      await controls.close(owned);
      results.push({
        direct,
        visited,
        nativeRefusals,
        ownerAnswersPreserved: true,
        entries: 0,
        submissions: 0,
        allBrowsersClosed: fixture.records.every((record) => record.closed),
      });
    } finally {
      await fixture.close();
    }
  }
  return results;
};
