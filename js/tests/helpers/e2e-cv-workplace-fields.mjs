import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { cvWorkplaceFieldsPatch } from '../../../experiments/issue-56/cv-workplace-fields-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { cvSaveAttempt } from '../../src/jobs/cv-watch-verification.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const screenshot = async (target, directory, name, fullPage = false) => {
  if (directory) {
    await mkdir(directory, { recursive: true });
    await target.screenshot({ path: join(directory, `${name}.png`), fullPage });
  }
};

const configureReview = async (f, panel) => {
  const { identity } = f.data.sources.find(
    (row) => row.identity.language === 'en'
  );
  await panel
    .locator('[data-cv-workplace-export]')
    .selectOption(`${identity.exportId}:${identity.hash}`);
  await panel.locator('[data-cv-workplace-action="loadSource"]').click();
  await panel.locator('[data-cv-workplace-fields]').waitFor();
  await panel.locator('[data-cv-workplace-record]').fill('123');
  for (const key of [
    'company',
    'position',
    'description',
    'website',
    'start',
  ]) {
    await panel
      .locator(`[data-cv-workplace-field="${key}"]`)
      .fill(cvWorkplaceFieldsPatch[key]);
  }
  await panel.locator('[data-cv-workplace-field="current"]').uncheck();
  await panel
    .locator('[data-cv-workplace-field="end"]')
    .fill(cvWorkplaceFieldsPatch.end);
  await panel.locator('[data-cv-workplace-field="areaId"]').selectOption('2');
  await panel.locator('[data-cv-workplace-industry="7.540"]').uncheck();
  await panel.locator('[data-cv-workplace-industry="7.541"]').check();
  await panel.locator('[data-cv-workplace-action="propose"]').click();
  await panel.locator('[data-cv-workplace-plan="draft"]').waitFor();
  assert.equal(
    await panel.locator('[data-cv-workplace-action="prepare"]').count(),
    0
  );
  await panel.locator('[data-cv-workplace-action="approve"]').click();
  await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
};
const verifyOwnerConflicts = async (f, prepare, page) => {
  const { provider } = f;

  await f.open();
  await provider.waitForFunction(() => globalThis.fixtureHydrated);
  f.beforeRead(() =>
    provider.locator('input[name="position"]').fill('Owner during fresh read')
  );
  await clickCvPreparation(page, prepare, 'failed');
  assert.equal(
    await provider.locator('input[name="position"]').inputValue(),
    'Owner during fresh read'
  );
  assert.equal(await provider.evaluate(() => globalThis.fixtureInputs), 0);
  await f.open();
  await provider.waitForFunction(() => globalThis.fixtureHydrated);
  await provider.evaluate(() => {
    globalThis.fixtureConcurrentOwner = true;
  });
  await clickCvPreparation(page, prepare, 'uncertain');
  assert.equal(
    await provider.locator('input[name="position"]').inputValue(),
    'Owner concurrent position'
  );
  assert.equal(
    await provider.locator('textarea').inputValue(),
    f.change.before
  );
  assert.equal(f.counters.saves, 0);
};
export const verifyCvWorkplaceFields = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
  });
  const { page, provider } = f;
  const panel = page.locator('[data-cv-workplace-review]');
  const prepare = panel.locator('[data-cv-workplace-action="prepare"]');
  const read = async () =>
    cvSaveAttempt(await provider.evaluate(readCvEditorDocument));
  const shot = (name, target = page) =>
    screenshot(target, screenshots, name, target === provider);
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-workplace-fields', name, work);
    cases++;
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await page.locator('[data-cv-technology-review]').waitFor();
    if (before) {
      await page
        .locator('[data-cv-technology-review]')
        .scrollIntoViewIfNeeded();
      await shot('cv-workplace-fields-before');
      assert.equal(
        await panel.count(),
        1,
        'All workplace fields need an explicit review and native draft preparation flow'
      );
      return;
    }
    await panel.waitFor();
    await run(
      'review and approve all nine fields before exact native draft preparation',
      async () => {
        await configureReview(f, panel);
        await f.open({ delay: 300 });
        const baseline = await read();
        const navigations = f.counters.navigations;
        await clickCvPreparation(page, prepare, 'prepared');
        assert.deepEqual(await read(), {
          ...baseline,
          ...Object.fromEntries(
            [
              'company',
              'position',
              'description',
              'website',
              'start',
              'end',
              'current',
            ].map((key) => [key, cvWorkplaceFieldsPatch[key]])
          ),
          area: 'Moscow',
          industryText: 'Automation',
        });
        assert.equal(f.counters.navigations, navigations);
        assert.equal(
          await provider.evaluate(() => globalThis.fixturePickerSaves),
          1
        );
        assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureCancels),
          0
        );
        await shot('cv-workplace-fields-native', provider);
        await panel
          .locator('[data-cv-workplace-plan]')
          .scrollIntoViewIfNeeded();
        await shot('cv-workplace-fields-desktop');
      }
    );
    await run(
      'owner changes made during fresh read and native typing survive without restoration',
      () => verifyOwnerConflicts(f, prepare, page)
    );
    await run(
      'shared, wrong-record and stale-native forms refuse preparation without typing',
      async () => {
        for (const options of [
          { shared: true },
          { recordId: '456' },
          { saved: { company: 'Other saved employer' } },
        ]) {
          await f.open(options);
          await provider.waitForFunction(() => globalThis.fixtureHydrated);
          const baseline = await read();
          await clickCvPreparation(page, prepare, 'failed');
          assert.deepEqual(await read(), baseline);
          assert.equal(
            await provider.evaluate(() => globalThis.fixtureInputs),
            0
          );
        }
      }
    );
    await run(
      'lost reply recovers the same approved plan and preparation on a phone without another edit',
      async () => {
        await f.open();
        await page.route('**/api/vacancies/cv-prepare', async (route) => {
          await route.fetch();
          await route.abort('connectionreset');
        });
        await prepare.click();
        await page.locator('[data-vacancy-error]').waitFor();
        await page.unroute('**/api/vacancies/cv-prepare');
        const attachments = f.counters.attached;
        const native = await read();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        await panel.locator('[data-cv-workplace-action="status"]').click();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        assert.equal(f.counters.attached, attachments);
        assert.deepEqual(await read(), native);
        assert.equal(f.counters.saves, 0);
        const geometry = await panel.evaluate((node) => ({
          width: node.clientWidth,
          scroll: node.scrollWidth,
        }));
        assert.ok(geometry.scroll <= geometry.width + 1);
        await panel
          .locator('[data-cv-preparation-state]')
          .scrollIntoViewIfNeeded();
        await shot('cv-workplace-fields-phone');
      }
    );
    assert.equal(f.counters.attached, f.counters.detached);
    assert.deepEqual(f.errors, []);
    console.log(
      '[cv-workplace-fields-evidence]',
      JSON.stringify({ cases, ...f.counters, errors: f.errors })
    );
    return { cases };
  } finally {
    await f.close();
  }
};
