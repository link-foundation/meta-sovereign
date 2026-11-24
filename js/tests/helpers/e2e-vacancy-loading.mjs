import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  vacancyMetadataFixture,
  vacancyDescriptionHtml,
} from '../../../experiments/issue-56/vacancy-metadata-fixture.mjs';

/** Real delayed native DOM, production collection, cache, routes and UI. */
export const verifyVacancyLoading = async (browser, { screenshots } = {}) => {
  const fixture = await vacancyMetadataFixture(browser, { delayed: true });
  const { page } = fixture;
  const panel = page.locator('[data-vacancies]');
  const screenshot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await panel.locator('[data-vacancy-action="search"]').click();
    await panel.locator('[data-vacancy-card]').first().waitFor();
    await panel.locator('[data-vacancy-action="collect"]').first().click();
    const snapshot = panel.locator('[data-vacancy-snapshot]');
    try {
      await snapshot.waitFor({ timeout: 10000 });
    } catch (error) {
      await screenshot('before');
      throw error;
    }
    assert.ok(
      (await snapshot.innerText()).includes('Final employer paragraph.')
    );
    const reads = fixture.delayedReads();
    assert.equal(reads[0].description, '');
    assert.ok(reads.length >= 2 && reads.length <= 80);
    assert.equal(
      reads.at(-1).description,
      'Build Python services.\nFinal employer paragraph.'
    );
    const saved = await fixture.store.query((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    assert.equal(saved.length, 1);
    assert.equal(saved[0].descriptionHtml, vacancyDescriptionHtml);
    await snapshot.scrollIntoViewIfNeeded();
    await screenshot('after');
    await page.setViewportSize({ width: 390, height: 844 });
    await snapshot.scrollIntoViewIfNeeded();
    assert.equal(await snapshot.isVisible(), true);
    await screenshot('phone');
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth
      ),
      true
    );
    assert.equal(
      fixture.records.length,
      2,
      'one search and one collection, without reopening'
    );
    assert.ok(
      fixture.records.every((record) => record.closed && record.clicks === 0)
    );
    assert.deepEqual(fixture.errors, []);
    return {
      delayedDescription: true,
      nativeReads: reads.length,
      exactDescriptionHtml: true,
      browserOpens: 2,
      providerClicks: 0,
      pageErrors: 0,
      liveProvider: false,
    };
  } finally {
    await fixture.close();
  }
};
