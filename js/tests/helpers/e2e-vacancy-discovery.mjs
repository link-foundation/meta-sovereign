import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';

/** Exercise actual HH pagination and description readers through the shared UI. */
export const verifyVacancyDiscovery = async (
  browser,
  {
    before = process.env.DISCOVERY_BEFORE === '1',
    screenshots = process.env.APPLICATION_SCREENSHOTS,
  } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page, records } = fixture;
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: join(screenshots, `vacancy-discovery-${name}.png`),
      });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    const panel = page.locator('[data-vacancies]');
    const discovery = panel.locator('[data-vacancy-discovery]');
    const start = discovery.locator('[data-discovery-action="start"]');
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
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
      return;
    }
    await start.click();
    const completed = discovery.locator('[data-discovery-phase="completed"]');
    await completed.waitFor();
    assert.equal(await discovery.locator('[data-discovery-card]').count(), 3);
    assert.match(await completed.innerText(), /Pages visited: 2/u);
    assert.match(
      await completed.innerText(),
      /Excluded: native card already marks a response/u
    );
    assert.equal(
      records.length,
      4,
      'Two search pages and two full eligible descriptions'
    );
    assert(records.every((row) => row.closed && row.clicks === 0));
    await completed.scrollIntoViewIfNeeded();
    await shot('after');
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
      'https://hh.ru/vacancy/123\nhttps://hh.ru/vacancy/125'
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
    for (const locale of ['ru', 'hi', 'zh', 'en']) {
      await page.evaluate(
        (locale) =>
          globalThis.localStorage.setItem('metaSovereignLocale', locale),
        locale
      );
      await page.reload();
      await completed.waitFor();
      assert(!/\bdiscovery\.[a-z]/u.test(await discovery.innerText()));
    }
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
        providerClicks: 0,
        recoveryReplayed: false,
        batchStarted: false,
        locales: 4,
        resourcesClosed: true,
      })
    );
  } finally {
    await fixture.close();
  }
};
