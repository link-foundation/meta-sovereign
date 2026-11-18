import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';

export const verifyVacancySearchUrl = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page, records } = fixture;
  const panel = page.locator('[data-vacancies]');
  const field = (key) => panel.locator(`[data-vacancy-field="${key}"]`);
  const action = (key) => panel.locator(`[data-vacancy-action="${key}"]`);
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: `${screenshots}/${name}.png` });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await panel.waitFor();
    await panel.scrollIntoViewIfNeeded();
    if (before) {
      await shot('before');
      assert.equal(
        await field('searchUrl').count(),
        1,
        'Owner search URL control must exist'
      );
      return;
    }
    const url =
      'https://hh.ru/search/vacancy?resume=original&area=1&area=2&experience=between3And6&employment=part&order_by=publication_time';
    await field('searchUrl').fill(url);
    await field('resume').fill('chosen');
    assert.equal(await field('area').isDisabled(), true);
    assert.equal(await field('order').isDisabled(), true);
    await action('search').click();
    await panel.locator('[data-vacancy-card]').first().waitFor();
    const first = new URL(records[0].navigation[0]);
    assert.equal(first.searchParams.get('resume'), 'chosen');
    assert.deepEqual(first.searchParams.getAll('area'), ['1', '2']);
    assert.equal(first.searchParams.get('experience'), 'between3And6');
    assert.equal(first.searchParams.get('order_by'), 'publication_time');
    await action('next').click();
    await panel
      .locator('[data-vacancy-card="https://hh.ru/vacancy/125"]')
      .waitFor();
    const next = new URL(records[1].navigation[0]);
    next.searchParams.set('page', '0');
    assert.equal(next.href, first.href);
    await field('searchUrl').scrollIntoViewIfNeeded();
    await shot('after');
    const count = records.length;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await panel.waitFor();
    assert.equal(await field('searchUrl').inputValue(), url);
    assert.equal(await field('resume').inputValue(), 'chosen');
    assert.equal(
      records.length,
      count,
      'Recovery must not replay provider reading'
    );
    assert.equal(
      await page.evaluate(
        () =>
          globalThis.document.documentElement.scrollWidth <=
          globalThis.innerWidth
      ),
      true
    );
    await field('searchUrl').scrollIntoViewIfNeeded();
    await shot('phone');
    await field('searchUrl').fill('');
    assert.equal(await field('area').isDisabled(), false);
    assert.deepEqual(fixture.errors, []);
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    return {
      searches: count,
      repeatedFilters: true,
      exactNextPage: true,
      selectedResume: 'chosen',
      cachedSettings: true,
      providerClicks: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
