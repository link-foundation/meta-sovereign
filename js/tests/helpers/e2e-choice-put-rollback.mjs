import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { choicePutFixture } from '../../../experiments/issue-56/choice-put-fixture.mjs';

export const verifyChoicePutRollback = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await choicePutFixture(browser);
  const { page } = fixture;
  try {
    await page.goto(`${fixture.base}/#/cv`);
    const panel = page.locator('[data-vacancies]');
    await panel.locator('[data-vacancy-field="query"]').fill('Python');
    await panel.locator('[data-vacancy-action="search"]').click();
    const card = panel.locator(
      '[data-vacancy-card="https://hh.ru/vacancy/123"]'
    );
    await card
      .locator('textarea')
      .fill('Keep the acknowledged schedule question.');
    await card.locator('[data-vacancy-choice-action="deferred"]').click();
    const saved = panel.locator('[data-saved-vacancy-choice]');
    await saved.locator('[data-vacancy-choice-state="deferred"]').waitFor();
    fixture.failNext();
    await saved.locator('textarea').fill('This replacement failed to save.');
    await saved.locator('[data-vacancy-choice-action="skipped"]').click();
    await panel.locator('[data-vacancy-choices] [role="alert"]').waitFor();
    assert.equal(await saved.locator('button').first().isDisabled(), true);
    await page.reload();
    await saved.waitFor();
    await saved.scrollIntoViewIfNeeded();
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({
        path: path.join(screenshots, `${before ? 'before' : 'after'}.png`),
      });
    }
    assert.equal(
      await saved
        .locator('[data-vacancy-choice-state]')
        .getAttribute('data-vacancy-choice-state'),
      'deferred',
      'Reload must retain the last acknowledged choice'
    );
    assert.equal(
      await saved.locator('textarea').inputValue(),
      'Keep the acknowledged schedule question.'
    );
    assert.equal(fixture.failed(), 1);
    const durable = (await fixture.snapshot()).links.find((row) =>
      row.id.startsWith('secret:jobs-vacancy-choices:')
    );
    assert.equal(durable.entries[0].state, 'deferred');
    assert.equal(
      durable.entries[0].note,
      'Keep the acknowledged schedule question.'
    );
    assert.deepEqual(fixture.errors, []);
    assert.ok(fixture.records.every((row) => row.closed && row.clicks === 0));
    return {
      failedSaves: 1,
      reloadPreserved: true,
      providerClicks: 0,
      pageErrors: [],
    };
  } finally {
    await fixture.close();
  }
};
