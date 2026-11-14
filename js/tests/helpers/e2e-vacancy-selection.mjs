import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';

const captureLayouts = async (page, summary, shot) => {
  await summary.scrollIntoViewIfNeeded();
  await shot('after');
  await page.setViewportSize({ width: 390, height: 950 });
  await summary.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.innerWidth
    ),
    true
  );
  await shot('phone');
};

export const verifyVacancySelection = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page } = fixture;
  const panel = page.locator('[data-vacancies]');
  const field = (key) => panel.locator(`[data-vacancy-field="${key}"]`);
  const summary = panel.locator('[data-vacancy-selection-summary]');
  const first = panel.locator(
    '[data-vacancy-card="https://hh.ru/vacancy/123"]'
  );
  const second = panel.locator(
    '[data-vacancy-card="https://hh.ru/vacancy/124"]'
  );
  const search = async () => {
    await panel.locator('[data-vacancy-action="search"]').click();
    await panel.locator('[data-vacancy-selection-summary="current"]').waitFor();
  };
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await field('query').fill('Python');
    if (before) {
      await panel.locator('[data-vacancy-action="search"]').click();
      await first.waitFor();
      await first.scrollIntoViewIfNeeded();
      await shot('before');
      assert.equal(
        await summary.count(),
        1,
        'Search selection reasons must be available'
      );
      return;
    }
    await field('excludeText').fill('final paragraph');
    await search();
    await first
      .locator('[data-vacancy-selection="needs-description"]')
      .waitFor();
    await second.locator('[data-vacancy-selection="responded"]').waitFor();
    assert.equal(await panel.locator('[data-vacancy-card]').count(), 2);
    await first.locator('[data-vacancy-action="collect"]').click();
    await panel.locator('[data-vacancy-snapshot]').waitFor();
    await search();
    await first.locator('[data-vacancy-selection="configured-text"]').waitFor();
    assert.match(await first.textContent(), /Description captured/u);
    await first.locator('textarea').fill('Review this saved exception later.');
    await first.locator('[data-vacancy-choice-action="deferred"]').click();
    await panel.locator('[data-saved-vacancy-choice]').waitFor();
    await panel.locator('[data-vacancy-selection-summary="stale"]').waitFor();
    assert.equal(await first.locator('[data-vacancy-selection]').count(), 0);
    await search();
    await first.locator('[data-vacancy-selection="owner-deferred"]').waitFor();
    await captureLayouts(page, summary, shot);
    fixture.mode('challenge');
    await panel.locator('[data-vacancy-action="search"]').click();
    await panel.locator('[data-vacancy-error]').waitFor();
    assert.equal(await panel.locator('[data-vacancy-card]').count(), 2);
    assert.match(await first.textContent(), /Deferred by your saved choice/u);
    fixture.mode('ready');
    await page.reload();
    await field('excludeText').waitFor();
    assert.equal(await field('excludeText').inputValue(), 'final paragraph');
    assert.equal(await field('skipResponded').isChecked(), true);
    await field('excludeText').fill('');
    await field('skipResponded').uncheck();
    await search();
    await second.locator('[data-vacancy-selection="review"]').waitFor();
    assert.deepEqual(fixture.errors, []);
    assert.ok(fixture.records.every((row) => row.closed && row.clicks === 0));
    return {
      cardsRetained: true,
      cachedProse: true,
      staleOwnerRefused: true,
      failedSearchPreserved: true,
      providerClicks: 0,
      pageErrors: [],
    };
  } catch (error) {
    if (process.env.E2E_TRACE_SELECTION === '1') {
      console.log(
        '[vacancy-selection-state]',
        JSON.stringify({
          terms: await field('excludeText')
            .inputValue()
            .catch(() => null),
          summary: await summary.allTextContents(),
          cards: await panel.locator('[data-vacancy-card]').allTextContents(),
          errors: fixture.errors,
        })
      );
      await shot('failure');
    }
    throw error;
  } finally {
    await fixture.close();
  }
};
