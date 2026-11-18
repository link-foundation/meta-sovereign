import assert from 'node:assert/strict';
import { applicationNativeFixture } from '../../../experiments/issue-56/application-native-fixture.mjs';
import { routePublishedWebBundle } from '../../../experiments/issue-56/published-web-bundle.mjs';
import { applicationPanelBrowser } from './application-panel-browser.mjs';
import { nativeApplicationForm } from './application-native-request.mjs';
import { applicationDelay } from '../../src/jobs/application-options.js';
import { previewVacancyDocument } from '../../src/jobs/application-preview.js';

const verifyDescriptionRefusals = async (owned) => {
  const expected = await owned.evaluate(() => ({
    url: globalThis.location.href,
    documentKey:
      document[Symbol.for('meta-sovereign.jobs.application-document.v1')],
    description: document
      .querySelector('[data-qa="vacancy-description"]')
      .innerText.trim(),
    scroll: false,
  }));
  assert.equal(await owned.evaluate(previewVacancyDocument, expected), true);
  for (const change of [
    { url: 'https://hh.ru/vacancy/999' },
    { url: 'https://hh.ru.evil.test/vacancy/123' },
    { documentKey: 'unreviewed-document' },
    { description: 'Changed prose' },
  ]) {
    assert.equal(
      await owned.evaluate(previewVacancyDocument, { ...expected, ...change }),
      false
    );
  }
  await owned.evaluate(() => {
    document.body.append(
      document.querySelector('[data-qa="vacancy-description"]').cloneNode(true)
    );
  });
  try {
    assert.equal(await owned.evaluate(previewVacancyDocument, expected), false);
  } finally {
    await owned.evaluate(() =>
      document.querySelectorAll('[data-qa="vacancy-description"]')[1].remove()
    );
  }
  return 5;
};

/** One real vacancy, native description scroll and both preserved review states. */
export const verifyNativeVacancyPreview = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const previews = [];
  const fixture = await applicationNativeFixture(browser, {
    application: {
      previewWait: async (ms, signal) => {
        const owned = nativeApplicationForm(
          browser,
          'https://hh.ru/vacancy/123'
        );
        const snapshot = await owned.evaluate(() => ({
          top: document
            .querySelector('[data-qa="vacancy-description"]')
            .getBoundingClientRect().top,
          scrollY: globalThis.scrollY,
          scrolledAt: globalThis.previewScrolledAt,
          entries: globalThis.applicationEntries,
          attempts: globalThis.applicationAttempts,
        }));
        assert(snapshot.scrollY > 0);
        assert(snapshot.top >= 0 && snapshot.top < 100);
        assert(Number.isFinite(snapshot.scrolledAt));
        assert.equal(snapshot.entries + snapshot.attempts, 0);
        const started = Date.now();
        await applicationDelay(ms, signal);
        previews.push({ ms, elapsedMs: Date.now() - started });
      },
    },
  });
  const controls = applicationPanelBrowser(fixture);
  const { page, panel, action } = controls;
  const shot = controls.screenshot(screenshots, 'vacancy-preview');
  try {
    if (before) {
      await routePublishedWebBundle(page, 'd21b7f97', [
        'js/src/web/application-panel.js',
        'js/src/web/application-state.js',
      ]);
    }
    await controls.select();
    const seconds = panel.locator(
      '[data-application-option="vacancyPreviewSeconds"]'
    );
    if (before) {
      await shot('before');
      assert.equal(await seconds.count(), 0);
      return {
        missingPreviewControl: true,
        errors: fixture.errors,
        liveProvider: false,
      };
    }
    assert.equal(await seconds.inputValue(), '3');
    await seconds.fill('0.1');
    await shot('settings');
    await action('start').click();
    await panel.locator('[data-application-state="ready"]').waitFor();
    await panel.locator('[data-application-preview-seconds="0.1"]').waitFor();
    const owned = nativeApplicationForm(browser, 'https://hh.ru/vacancy/123');
    const nativeRefusals = await verifyDescriptionRefusals(owned);
    await owned.locator('[data-qa="vacancy-description"]').evaluate((node) => {
      node.style.marginTop = '1800px';
      document.body.style.paddingBottom = '1200px';
      const scroll = node.scrollIntoView.bind(node);
      node.scrollIntoView = (options) => {
        globalThis.previewScrolledAt = Date.now();
        scroll(options);
      };
    });
    const saved = (await fixture.store.query()).find((row) =>
      row.id.startsWith('secret:jobs-application:')
    );
    assert.equal(saved.options.vacancyPreviewSeconds, 0.1);
    try {
      await controls.confirmed('enter');
    } catch (error) {
      console.error(
        JSON.stringify({
          panel: await panel.innerText(),
          errors: fixture.errors,
        })
      );
      throw error;
    }
    await panel.locator('[data-application-state="review"]').waitFor();
    assert.equal(await owned.evaluate(() => globalThis.applicationEntries), 1);
    assert.equal(await owned.evaluate(() => globalThis.applicationAttempts), 0);
    assert.equal(previews.length, 1);
    assert.equal(previews[0].ms, 100);
    assert(previews[0].elapsedMs >= 90);
    await shot('after');
    await controls.locales('[data-application-preview-seconds="0.1"]');
    await controls.phone();
    await shot('phone');
    await controls.close(owned);
    return {
      previewSeconds: 0.1,
      nativeRefusals,
      previews,
      locales: 4,
      entries: 1,
      submissions: 0,
      allBrowsersClosed: fixture.records.every((record) => record.closed),
      errors: fixture.errors,
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
