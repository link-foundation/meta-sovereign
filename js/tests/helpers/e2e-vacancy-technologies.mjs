import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { technologyFixture } from '../../../experiments/issue-56/technology-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import { wirePost } from './vacancy-routes.mjs';
import { decodeWire, LINO_TEXT } from '../../src/transport/lino.js';
import { assertNextControl } from './e2e-keyboard-controls.mjs';

const verifyCatalogConflict = async ({
  run,
  savedCatalog,
  view,
  field,
  action,
  fixture,
  page,
}) => {
  await run(
    'stale catalog saves preserve draft and old report until explicit reload',
    async () => {
      const catalog = await savedCatalog();
      await view.locator('[data-technology-catalog] > summary').click();
      await field('canonical').fill('Lua');
      await action('entry-save').click();
      const changed = await wirePost(
        fixture.base,
        'technology-catalog-save',
        {
          ...catalog,
          entries: [
            ...catalog.entries,
            { canonical: 'Zig', aliases: [], caseSensitive: false },
          ],
        },
        LINO_TEXT
      );
      assert.equal(changed.status, 200);
      await action('catalog-save').click();
      await page.locator('[data-vacancy-error]').waitFor();
      assert.match(
        await page.locator('[data-vacancy-error]').textContent(),
        /catalog conflict/u
      );
      assert.ok((await field('entry').textContent()).includes('Lua'));
      assert.ok(
        !(await savedCatalog()).entries.some((row) => row.canonical === 'Lua')
      );
      await action('reload').click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-technology-action="catalog-save"]')
            .disabled
      );
      await view.locator('[data-technology-catalog] > summary').click();
      assert.ok(!(await field('entry').textContent()).includes('Lua'));
      assert.ok((await field('entry').textContent()).includes('Zig'));
      await view.locator('[data-technology-catalog] > summary').click();
    }
  );
};

const verifyLostAcknowledgement = async ({
  run,
  page,
  field,
  action,
  store,
  view,
  shot,
  records,
  fixture,
  data,
}) => {
  await run(
    'lost analysis acknowledgement is recovered read-only on phone with keyboard access',
    async () => {
      let posts = 0;
      await page.route('**/api/vacancies/technology-analyze', async (route) => {
        posts++;
        await route.fetch();
        await route.abort('failed');
      });
      await field('resume').selectOption(
        `${data.receipt.exportId}:${data.receipt.hash}`
      );
      await action('analyze').click();
      await page.locator('[data-vacancy-error]').waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector('[data-technology-action="reload"]').disabled
      );
      await page.unroute('**/api/vacancies/technology-analyze');
      await action('reload').click();
      const saved = (await store.get('jobs-technology-analysis:jobs')).analysis;
      await view
        .locator(`[data-technology-report="${saved.fingerprint}"]`)
        .waitFor();
      assert.equal(posts, 1);
      await page.setViewportSize({ width: 390, height: 844 });
      await assertNextControl(page, field('resume'), action('analyze'));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= globalThis.innerWidth
        ),
        true
      );
      await view.locator('h3').scrollIntoViewIfNeeded();
      await shot('technologies-phone');
      assert.equal(records.length, 0);
      assert.deepEqual(fixture.errors, []);
    }
  );
};

export const verifyVacancyTechnologies = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const data = await technologyFixture();
  const fixture = await vacancyBrowserFixture(browser, {
    exports: { service: () => ({ artifactRoot: data.artifactRoot }) },
  });
  const { page, records, store } = fixture;
  const view = page.locator('[data-vacancy-technologies]');
  const action = (name) => view.locator(`[data-technology-action="${name}"]`);
  const field = (name) => view.locator(`[data-technology-field="${name}"]`);
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('vacancy-technologies', name, work);
    cases++;
  };
  const shot = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      if (!before) {
        await view.evaluate((node) => {
          node.style.scrollMarginTop = '80px';
          node.scrollIntoView({ block: 'start', behavior: 'instant' });
        });
      }
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const savedCatalog = async () => {
    const response = await fetch(
      `${fixture.base}/api/vacancies/technology-catalog`
    );
    return decodeWire(
      await response.arrayBuffer(),
      response.headers.get('content-type')
    );
  };
  try {
    for (const row of data.rows) {
      await store.put(row);
    }
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-vacancies]').waitFor();
    if (before) {
      await page.locator('[data-resume-exports]').scrollIntoViewIfNeeded();
      await shot('technologies-before');
      assert.equal(
        await view.count(),
        1,
        'The CV view must expose evidence-based vacancy technology analysis'
      );
      return;
    }
    await view.waitFor();
    await run(
      'explicit verified export produces a cached report with corpus and per-field evidence',
      async () => {
        assert.equal(await action('analyze').isDisabled(), true);
        await field('resume').selectOption(
          `${data.receipt.exportId}:${data.receipt.hash}`
        );
        await action('analyze').click();
        await view.locator('[data-technology-report]').waitFor();
        const row = await store.get('jobs-technology-analysis:jobs');
        assert.equal(row.analysis.vacancies.length, 2);
        assert.match(await view.textContent(), /React Native/u);
        await view.locator('[data-technology-statistics] > summary').click();
        await view.scrollIntoViewIfNeeded();
        await shot('technologies-desktop');
        assert.equal(records.length, 0);
      }
    );
    await run(
      'catalog drafts block analysis until acknowledged and a reload recovers without running again',
      async () => {
        await view.locator('[data-technology-catalog] > summary').click();
        await field('canonical').fill('Rust');
        await field('aliases').fill('Rustlang');
        await action('entry-save').click();
        assert.equal(await action('analyze').isDisabled(), true);
        await action('catalog-save').click();
        await action('catalog-save').waitFor({ state: 'attached' });
        await page.waitForFunction(
          () =>
            !document.querySelector('[data-technology-action="analyze"]')
              .disabled
        );
        assert.ok(
          (await savedCatalog()).entries.some((row) => row.canonical === 'Rust')
        );
        assert.match(await view.textContent(), /different catalog revision/u);
        const previous = (await store.get('jobs-technology-analysis:jobs'))
          .analysis.fingerprint;
        await page.reload();
        await view.locator('[data-technology-report]').waitFor();
        assert.equal(
          await view
            .locator('[data-technology-report]')
            .getAttribute('data-technology-report'),
          previous
        );
        assert.equal(await action('analyze').isDisabled(), true);
      }
    );
    await verifyCatalogConflict({
      run,
      savedCatalog,
      view,
      field,
      action,
      fixture,
      page,
    });
    await verifyLostAcknowledgement({
      run,
      page,
      field,
      action,
      store,
      view,
      shot,
      records,
      fixture,
      data,
    });
    return { cases, providerReads: records.length, cachedVacancies: 2 };
  } finally {
    await fixture.close();
    await data.close();
  }
};
