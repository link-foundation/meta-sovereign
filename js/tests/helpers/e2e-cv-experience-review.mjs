import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cvPrepareBrowserFixture } from '../../../experiments/issue-56/cv-prepare-browser-fixture.mjs';

export const verifyCvExperienceReview = async (browser) => {
  const fixture = await cvPrepareBrowserFixture(browser, { reviewQueue: true });
  const { page, provider, queue, counters } = fixture;
  page.setDefaultTimeout(10000);
  const before = process.env.EXPERIENCE_REVIEW_BEFORE_BUNDLE;
  const directory = process.env.EXPERIENCE_REVIEW_SCREENSHOTS;
  const action = (name) =>
    page.locator(`[data-experience-review-action="${name}"]`);
  const phase = (name) =>
    page.locator(`[data-experience-review-phase="${name}"]`).waitFor();
  const countersInPage = () =>
    provider.evaluate(() => [
      globalThis.fixtureOpeners,
      globalThis.fixtureSaves,
      globalThis.fixtureCancels,
    ]);
  const capture = async (name, target) => {
    if (directory) {
      await mkdir(directory, { recursive: true });
      await target.scrollIntoViewIfNeeded();
      await target.page().screenshot({ path: join(directory, `${name}.png`) });
    }
  };
  try {
    if (before) {
      const body = await readFile(before);
      await page.route('**/app.min.js*', (route) =>
        route.fulfill({ body, contentType: 'application/javascript' })
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-experience-documents] summary').first().click();
    const auto = page.locator('[data-experience-auto]');
    await auto.locator('summary').click();
    const field = (name) =>
      auto.locator(`[data-experience-auto-field="${name}"]`);
    await field('url').fill(queue.input.url);
    await field('hash').fill(queue.input.hash);
    await field('to').selectOption('hh');
    if (before) {
      await capture(
        'before',
        auto.locator('[data-experience-auto-action="start"]')
      );
      assert.equal(
        await action('start').count(),
        1,
        'one command should acquire and start reviewed changes'
      );
      return;
    }
    await action('start').click();
    await phase('prepared');
    await page
      .locator('[data-experience-review] [data-experience-plan-field="about"]')
      .waitFor();
    const native = provider.locator('textarea[data-qa="resume-editor-about"]');
    assert.equal(await native.inputValue(), queue.source.profile.about);
    assert.deepEqual(await countersInPage(), [1, 0, 0]);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= globalThis.innerWidth + 1
      )
    );
    await capture('prepared-phone', action('save'));
    await capture('native-draft', native);
    await action('save').click();
    await phase('completed');
    const saved = page.locator('[data-experience-review-outcome="saved"]');
    assert.match(await saved.textContent(), /Saved and verified/u);
    assert.match(
      await saved.getAttribute('data-experience-review-revision'),
      /^[0-9a-f]{64}$/u
    );
    assert.deepEqual(await countersInPage(), [1, 1, 0]);
    assert.equal(counters.attached, counters.detached);
    await capture('saved-phone', saved);
    await page.reload();
    await page.locator('[data-experience-documents] summary').first().click();
    await page.locator('[data-experience-auto] summary').click();
    await phase('completed');
    assert.deepEqual(await countersInPage(), [1, 1, 0]);
    assert.deepEqual(fixture.errors, []);
  } finally {
    await fixture.close();
  }
};
