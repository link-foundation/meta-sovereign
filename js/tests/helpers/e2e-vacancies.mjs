import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import {
  vacancySnapshotFixture,
  vacancyUrl,
} from '../../../experiments/issue-56/vacancy-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const searchPages = async ({ panel, action, field, records, shot }) => {
  await field('query').fill('Python');
  await field('resume').fill('selected-resume');
  await field('salary').fill('250000');
  await field('remote').check();
  await field('browserSlot').fill('jobs-2');
  await action('search').click();
  await panel.locator('[data-vacancy-card]').first().waitFor();
  assert.equal(await panel.locator('[data-vacancy-card]').count(), 2);
  const first = new URL(records[0].navigation[0]);
  assert.equal(first.searchParams.get('resume'), 'selected-resume');
  assert.equal(first.searchParams.get('order_by'), 'salary_desc');
  assert.equal(first.searchParams.get('work_format'), 'REMOTE');
  assert.equal(records[0].options.useCase, 'jobs');
  assert.equal(records[0].options.slot, 'jobs-2');
  assert.equal(Object.hasOwn(records[0].options, 'headless'), false);
  await action('next').click();
  await panel
    .locator('[data-vacancy-card="https://hh.ru/vacancy/125"]')
    .waitFor();
  assert.equal(
    new URL(records[1].navigation[0]).searchParams.get('resume'),
    'selected-resume'
  );
  assert.equal(new URL(records[1].navigation[0]).searchParams.get('page'), '1');
  assert.equal(await action('next').isDisabled(), true);
  await action('previous').click();
  await panel
    .locator('[data-vacancy-card="https://hh.ru/vacancy/123"]')
    .waitFor();
  await shot('vacancies-search');
};

export const verifyVacancies = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const fixture = await vacancyBrowserFixture(browser);
  const { page, records } = fixture;
  const panel = page.locator('[data-vacancies]');
  const action = (id) => panel.locator(`[data-vacancy-action="${id}"]`);
  const field = (key) => panel.locator(`[data-vacancy-field="${key}"]`);
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  let cases = 0;
  const run = async (name, fn) => {
    await traceBrowserScenario('vacancies', name, fn);
    cases++;
  };
  try {
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('.cv-view').waitFor();
    if (before) {
      await shot('vacancies-before');
      assert.equal(
        await panel.count(),
        1,
        'The CV view must offer vacancy search and collection'
      );
      return;
    }
    await panel.waitFor();
    await panel.scrollIntoViewIfNeeded();
    await run(
      'typed search and exact next page use native provider DOM without applying',
      async () => {
        await searchPages({ panel, action, field, records, shot });
      }
    );
    await run(
      'full description preserves prose and metadata while repeat collection uses the cache',
      async () => {
        await action('collect').first().click();
        const selected = panel.locator(
          `[data-vacancy-snapshot="${vacancyUrl}"]`
        );
        await selected.waitFor();
        assert.equal(
          await selected.locator('pre').innerText(),
          vacancySnapshotFixture().description
        );
        assert.ok((await selected.innerText()).includes('от 250 000 ₽'));
        assert.ok((await selected.innerText()).includes('Удалённо'));
        const count = records.length;
        await action('collect').first().click();
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-vacancy-action="search"]').disabled
        );
        assert.equal(records.length, count);
        await selected.scrollIntoViewIfNeeded();
        await shot('vacancies-collected');
      }
    );
    await run(
      'failed refresh keeps the complete cached snapshot visible',
      async () => {
        fixture.mode('incomplete');
        await action('refresh').click();
        await panel.locator('[data-vacancy-error]').waitFor();
        assert.equal(
          await panel.locator('[data-vacancy-snapshot] pre').innerText(),
          vacancySnapshotFixture().description
        );
        await shot('vacancies-failed-refresh');
        fixture.mode('ready');
      }
    );
    await run(
      'Stop drains a late owned launch without navigating or writing',
      async () => {
        const release = fixture.holdLaunch();
        const count = records.length;
        try {
          await action('search').click();
          await page.waitForFunction(
            () =>
              !document.querySelector('[data-vacancy-action="stop"]').disabled
          );
          const cancelled = fixture.cancellation();
          await action('stop').click();
          await cancelled;
        } finally {
          release();
        }
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-vacancy-action="search"]').disabled
        );
        assert.equal(records.length, count + 1);
        assert.deepEqual(records.at(-1).navigation, []);
        assert.equal(records.at(-1).closed, true);
      }
    );
    await run(
      'phone reload restores settings and cached description without replaying a browser read',
      async () => {
        const count = records.length;
        await page.setViewportSize({ width: 390, height: 950 });
        await page.reload();
        await panel.waitFor();
        await panel
          .getByRole('button', { name: 'Python engineer', exact: true })
          .click();
        await panel.locator('[data-vacancy-snapshot]').waitFor();
        assert.equal(await field('resume').inputValue(), 'selected-resume');
        assert.equal(records.length, count);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ),
          true
        );
        await panel.locator('[data-vacancy-snapshot]').scrollIntoViewIfNeeded();
        await shot('vacancies-phone');
      }
    );
    assert.deepEqual(fixture.errors, []);
    assert.ok(records.every((record) => record.closed && record.clicks === 0));
    return {
      cases,
      opens: records.length,
      providerClicks: 0,
      pageErrors: fixture.errors,
    };
  } catch (error) {
    await shot('vacancies-failed');
    throw error;
  } finally {
    await fixture.close();
  }
};
