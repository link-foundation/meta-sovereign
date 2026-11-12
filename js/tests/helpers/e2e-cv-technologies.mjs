import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { vacancyBrowserFixture } from '../../../experiments/issue-56/vacancy-browser-fixture.mjs';
import { cvTechnologyFixture } from '../../../experiments/issue-56/cv-technology-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';
import { assertNextControl } from './e2e-keyboard-controls.mjs';

const verifyReviewedSave = async ({ run, view, page, action, store }) => {
  await run(
    'keyboard selection saves a local reviewed receipt and read-only reload retains it',
    async () => {
      const checkbox = view.locator('[data-cv-technology-select="ru:about"]');
      await checkbox.focus();
      await page.keyboard.press('Space');
      assert.equal(await checkbox.isChecked(), true);
      const geometry = await checkbox.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        height: node.getBoundingClientRect().height,
      }));
      assert.ok(geometry.width < 30 && geometry.height < 30);
      await action('save').click();
      await page.waitForFunction(() =>
        document
          .querySelector('[data-cv-technology-plan]')
          ?.textContent.includes('Provider CV unchanged')
      );
      const saved = await store.get('jobs-cv-technology-review:jobs');
      assert.equal(saved.review.status, 'reviewed');
      assert.deepEqual(saved.review.selected, ['ru:about']);
      await page.reload();
      await view
        .locator(`[data-cv-technology-plan="${saved.review.fingerprint}"]`)
        .waitFor();
      assert.equal(await action('generate').isDisabled(), true);
      assert.equal(await checkbox.isChecked(), true);
    }
  );
};

export const verifyCvTechnologies = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const data = await cvTechnologyFixture();
  const fixture = await vacancyBrowserFixture(browser, {
    exports: { service: () => ({ artifactRoot: data.artifactRoot }) },
  });
  const { page, store, records } = fixture;
  const view = page.locator('[data-cv-technology-review]');
  const action = (name) =>
    view.locator(`[data-cv-technology-action="${name}"]`);
  const choose = async () => {
    for (const [index, language] of ['ru', 'en'].entries()) {
      const receipt = data.receipts[index];
      await view
        .locator(`[data-cv-technology-export="${language}"]`)
        .selectOption(`${receipt.exportId}:${receipt.hash}`);
    }
  };
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-technologies', name, work);
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
  try {
    for (const row of data.rows) {
      await store.put(row);
    }
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-vacancies]').waitFor();
    if (before) {
      await page
        .locator('[data-vacancy-technologies]')
        .scrollIntoViewIfNeeded();
      await shot('cv-technologies-before');
      assert.equal(
        await view.count(),
        1,
        'The CV surface must expose bilingual field-specific technology review'
      );
      return;
    }
    await view.waitFor();
    await run(
      'two explicit verified language exports produce preserved field evidence without provider reads',
      async () => {
        assert.equal(await action('generate').isDisabled(), true);
        await choose();
        await action('generate').click();
        await view.locator('[data-cv-technology-plan]').waitFor();
        const { review } = await store.get('jobs-cv-technology-review:jobs');
        assert.deepEqual(review.report.blockers, []);
        assert.match(
          await view.textContent(),
          /Keep this final narrative unchanged/u
        );
        assert.match(await view.textContent(), /\.NET Framework/u);
        await view.locator('[data-cv-technology-raw] > summary').click();
        assert.match(
          await view.locator('[data-cv-technology-raw]').textContent(),
          /Duplicates: 1/u
        );
        await shot('cv-technologies-desktop');
        assert.equal(records.length, 0);
      }
    );
    await verifyReviewedSave({ run, view, page, action, store });
    await run(
      'lost generation response retains previous review and recovers by GET without replay',
      async () => {
        const old = (await store.get('jobs-cv-technology-review:jobs')).review
          .fingerprint;
        let posts = 0;
        await page.route(
          '**/api/vacancies/technology-review',
          async (route) => {
            posts++;
            await route.fetch();
            await route.abort('failed');
          }
        );
        await choose();
        await action('generate').click();
        await page.locator('[data-vacancy-error]').waitFor();
        assert.equal(
          await view
            .locator('[data-cv-technology-plan]')
            .getAttribute('data-cv-technology-plan'),
          old
        );
        await page.unroute('**/api/vacancies/technology-review');
        await action('reload').click();
        const next = (await store.get('jobs-cv-technology-review:jobs')).review
          .fingerprint;
        await view.locator(`[data-cv-technology-plan="${next}"]`).waitFor();
        assert.equal(posts, 1);
        assert.equal(await action('save').isDisabled(), true);
      }
    );
    await run(
      'phone layout and keyboard controls remain usable with cached proposals',
      async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await assertNextControl(
          page,
          view.locator('[data-cv-technology-export="en"]'),
          action('generate')
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= globalThis.innerWidth
          ),
          true
        );
        await shot('cv-technologies-phone');
        assert.deepEqual(fixture.errors, []);
        assert.equal(records.length, 0);
      }
    );
    return { cases, providerReads: records.length, exports: 2 };
  } finally {
    await fixture.close();
    await data.close();
  }
};
