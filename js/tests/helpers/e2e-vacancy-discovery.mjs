import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { runVacancy } from '../../src/assignments/vacancy-run-context.js';

const verifyCollectedVacancies = async (store, memoryOnly) => {
  const cached = await store.query((row) =>
    row.id.startsWith('assignment-vacancy:')
  );
  assert.deepEqual(
    cached.map((row) => row.url).sort(),
    memoryOnly ? [] : ['https://hh.ru/vacancy/123', 'https://hh.ru/vacancy/125']
  );
};

const prepareDiscovery = async ({
  panel,
  discovery,
  start,
  before,
  excludedTitle,
  memoryOnly,
  shot,
}) => {
  await panel.locator('[data-vacancy-field="query"]').fill('Python');
  if (excludedTitle) {
    await panel
      .locator('[data-vacancy-field="excludeText"]')
      .fill('Python engineer 123');
  }
  if (memoryOnly) {
    await start.waitFor();
    const collect = discovery.locator(
      '[data-discovery-field="collectVacancies"]'
    );
    if (before) {
      await start.scrollIntoViewIfNeeded();
      await shot('before');
      assert.equal(
        await collect.count(),
        1,
        'Discovery must expose its description-storage setting'
      );
      return false;
    }
    await collect.uncheck();
  }
  if (before) {
    await panel
      .locator('[data-vacancy-action="search"]')
      .scrollIntoViewIfNeeded();
    await shot('before');
    assert.equal(
      await discovery.count(),
      1,
      'Finite automatic discovery must be available'
    );
    return false;
  }
  return true;
};

const verifyDiscoveryLocales = async (page, discovery, completed) => {
  for (const locale of ['ru', 'hi', 'zh', 'en']) {
    await page.evaluate(
      (locale) =>
        globalThis.localStorage.setItem('metaSovereignLocale', locale),
      locale
    );
    await page.reload();
    await completed.waitFor();
    assert.equal(
      await page.locator('select[data-locale]').inputValue(),
      locale
    );
    assert(!/\bdiscovery\.[a-z]/u.test(await discovery.innerText()));
  }
};

const discoveryShot = (page, screenshots) => async (name) => {
  if (screenshots) {
    await mkdir(screenshots, { recursive: true });
    await page.screenshot({
      path: join(screenshots, `vacancy-discovery-${name}.png`),
    });
  }
};

const verifyTemporaryDescription = async (discovery, fixture) => {
  await discovery.locator('[data-discovery-collection="memory"]').waitFor();
  assert(
    runVacancy(fixture.runtimeStore, 'https://hh.ru/vacancy/123')?.description
  );
};

/** Exercise actual HH pagination and description readers through the shared UI. */
export const verifyVacancyDiscovery = async (
  browser,
  {
    before = process.env.DISCOVERY_BEFORE === '1',
    screenshots = process.env.APPLICATION_SCREENSHOTS,
    excludedTitle = false,
    memoryOnly = false,
  } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page, records } = fixture;
  const shot = discoveryShot(page, screenshots);
  try {
    await page.goto(`${fixture.base}/#/cv`);
    const panel = page.locator('[data-vacancies]');
    const discovery = panel.locator('[data-vacancy-discovery]');
    const start = discovery.locator('[data-discovery-action="start"]');
    if (
      !(await prepareDiscovery({
        panel,
        discovery,
        start,
        before,
        excludedTitle,
        memoryOnly,
        shot,
      }))
    ) {
      return;
    }
    await start.click();
    // Four sequential native reads each retain their own navigation readiness.
    // Require acknowledged forward progress within the existing locator deadline.
    for (const id of ['123', '124', '125']) {
      await discovery
        .locator(`[data-discovery-card="https://hh.ru/vacancy/${id}"]`)
        .waitFor();
    }
    const completed = discovery.locator('[data-discovery-phase="completed"]');
    await completed.waitFor();
    assert.equal(await discovery.locator('[data-discovery-card]').count(), 3);
    assert.match(await completed.innerText(), /Pages visited: 2/u);
    assert.match(
      await completed.innerText(),
      /Excluded: native card already marks a response/u
    );
    await completed.scrollIntoViewIfNeeded();
    await shot('after');
    assert.equal(
      records.length,
      4,
      'Two search pages and two full selected descriptions'
    );
    assert(records.every((row) => row.closed && row.clicks === 0));
    await verifyCollectedVacancies(fixture.store, memoryOnly);
    if (memoryOnly) {
      await verifyTemporaryDescription(discovery, fixture);
    }
    const count = records.length;
    await page.reload();
    await completed.waitFor();
    assert.equal(
      records.length,
      count,
      'Reload observes saved progress without native work'
    );
    const batch = panel.locator('[data-application-batch]');
    await batch
      .locator('[data-application-batch-action="use-discovery"]')
      .click();
    assert.equal(
      await batch.locator('[data-application-batch-field="urls"]').inputValue(),
      excludedTitle
        ? 'https://hh.ru/vacancy/125'
        : 'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/125'
    );
    assert(
      await batch
        .locator('[data-application-batch-action="start"]')
        .isDisabled()
    );
    assert.equal(
      records.length,
      count,
      'Copying results only fills the batch draft'
    );
    if (memoryOnly) {
      assert.equal(
        await panel
          .locator('[data-application-option="collectVacancies"]')
          .isChecked(),
        false,
        'Batch handoff retains disabled description storage'
      );
    }
    await verifyDiscoveryLocales(page, discovery, completed);
    await page.setViewportSize({ width: 390, height: 950 });
    await completed.scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      )
    );
    await shot('phone');
    assert.equal(records.length, count);
    assert.deepEqual(fixture.errors, []);
    console.log(
      JSON.stringify({
        pages: 2,
        vacancies: 3,
        descriptions: 2,
        excludedTitleCollected: excludedTitle,
        memoryOnly,
        providerClicks: 0,
        recoveryReplayed: false,
        batchStarted: false,
        locales: 4,
        resourcesClosed: true,
        navigationMs: records.map((record) => record.navigationMs),
      })
    );
  } catch (error) {
    await shot('failure');
    console.error(
      '[vacancy-discovery-diagnostics]',
      JSON.stringify({
        phases: await page
          .locator('[data-discovery-phase]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.dataset.discoveryPhase)
          ),
        cards: await page.locator('[data-discovery-card]').count(),
        reads: records.map(({ closed, clicks, navigationMs }) => ({
          closed,
          clicks,
          navigationMs,
        })),
      })
    );
    throw error;
  } finally {
    await fixture.close();
    if (memoryOnly) {
      assert.equal(
        runVacancy(fixture.runtimeStore, 'https://hh.ru/vacancy/123'),
        null
      );
    }
  }
};

export const verifyFilteredVacancyDiscovery = (browser) =>
  verifyVacancyDiscovery(browser, { excludedTitle: true });

export const verifyMemoryVacancyDiscovery = (browser) =>
  verifyVacancyDiscovery(browser, { memoryOnly: true });
