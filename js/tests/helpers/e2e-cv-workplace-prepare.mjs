import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const verifyRefusals = async (f, button, fields, inputs) => {
  for (const options of [
    { recordId: '456' },
    { saved: { company: 'Other saved company' } },
    { challenge: true },
  ]) {
    await f.open(options);
    await f.provider.waitForFunction(() => globalThis.fixtureHydrated);
    const baseline = await fields();
    await clickCvPreparation(f.page, button, 'failed');
    assert.deepEqual(await fields(), baseline);
    assert.equal(await inputs(), 0);
    assert.equal(await f.provider.evaluate(() => globalThis.fixtureSaves), 0);
  }
};

const verifyConcurrentOwnerEdit = async (f, button, fields, inputs) => {
  for (const selector of [
    'input[name="company"]',
    'input[data-qa^="profile-resumes-list-checkbox-"]:not([readonly])',
  ]) {
    await f.open();
    await f.provider.waitForFunction(() => globalThis.fixtureHydrated);
    let ownerDraft;
    f.beforeRead(async () => {
      const field = f.provider.locator(selector);
      if (selector.includes('company')) {
        await field.fill('Owner company during read');
      } else {
        await field.check();
      }
      ownerDraft = await fields();
    });
    await clickCvPreparation(f.page, button, 'failed');
    assert.deepEqual(await fields(), ownerDraft);
    assert.equal(await inputs(), 0);
  }
};

export const verifyCvWorkplacePreparation = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser);
  const { page, provider } = f;
  const panel = page.locator('[data-cv-preparation]');
  const button = panel.locator(
    '[data-cv-prepare-change="en:jobs.0.description"]'
  );
  const record = panel.locator(
    '[data-cv-prepare-record="en:jobs.0.description"]'
  );
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-workplace-prepare', name, work);
    cases++;
  };
  const shot = async (name, target = page) => {
    if (!screenshots) {
      return;
    }
    await mkdir(screenshots, { recursive: true });
    await target.screenshot({ path: join(screenshots, `${name}.png`) });
  };
  const fields = () => provider.evaluate(readCvEditorDocument);
  const inputs = () => provider.evaluate(() => globalThis.fixtureInputs);
  try {
    await page.goto(`${f.base}/#/cv`);
    await page.locator('[data-cv-technology-plan]').waitFor();
    await panel.scrollIntoViewIfNeeded();
    if (before) {
      await shot('cv-workplace-prepare-before');
      assert.equal(
        await button.count(),
        1,
        'A reviewed workplace description must expose native preparation'
      );
      return;
    }
    await record.waitFor();
    await run(
      'exact reviewed description hydrates the native controlled draft without Save or other field changes',
      async () => {
        assert.equal(await button.isEnabled(), false);
        await record.fill('123');
        await f.open({ delay: 350 });
        const baseline = await fields();
        const navigations = f.counters.navigations;
        await clickCvPreparation(page, button, 'prepared');
        assert.deepEqual(await fields(), {
          ...baseline,
          description: f.change.after,
        });
        assert.equal(f.counters.navigations, navigations);
        assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureCancels),
          0
        );
        assert.equal(f.counters.attached, f.counters.detached);
        assert.equal(f.counters.reads, 1);
        await shot('cv-workplace-prepare-native', provider);
        await panel.scrollIntoViewIfNeeded();
        await shot('cv-workplace-prepare-desktop');
        const attachments = f.counters.attached;
        await page.reload();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        assert.match(await panel.textContent(), /123/u);
        assert.equal(f.counters.attached, attachments);
        await record.fill('123');
      }
    );
    await run(
      'owner changes and shared CV membership are preserved with no keyboard events',
      async () => {
        await provider
          .locator('textarea')
          .fill('Owner draft after preparation');
        let count = await inputs();
        await clickCvPreparation(page, button, 'failed');
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Owner draft after preparation'
        );
        assert.equal(await inputs(), count);
        assert.match(await panel.textContent(), /jobs-cv-baseline/u);
        await f.open({ shared: true });
        await provider.waitForFunction(() => globalThis.fixtureHydrated);
        const baseline = await fields();
        count = await inputs();
        const reads = f.counters.reads;
        await clickCvPreparation(page, button, 'failed');
        assert.match(await panel.textContent(), /jobs-cv-shared/u);
        assert.deepEqual(await fields(), baseline);
        assert.equal(await inputs(), count);
        assert.equal(f.counters.reads, reads);
      }
    );
    await run(
      'wrong identity, stale native metadata and provider challenges refuse all writes',
      () => verifyRefusals(f, button, fields, inputs)
    );
    await run(
      'owner company and membership edits during the saved read survive without typing',
      () => verifyConcurrentOwnerEdit(f, button, fields, inputs)
    );
    await run(
      'a lost preparation reply recovers the exact persisted record without another native action',
      async () => {
        await f.open({ maxLength: f.change.after.length });
        await page.route('**/api/vacancies/cv-prepare', async (route) => {
          await route.fetch();
          await route.abort('connectionreset');
        });
        await button.click();
        await page.locator('[data-vacancy-error]').waitFor();
        await page.unroute('**/api/vacancies/cv-prepare');
        const count = await inputs();
        const attachments = f.counters.attached;
        await panel.locator('[data-cv-prepare-reload]').click();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        assert.equal(
          await provider.locator('textarea').inputValue(),
          f.change.after
        );
        assert.equal(await inputs(), count);
        assert.equal(f.counters.attached, attachments);
        assert.equal(f.counters.saves, 0);
        await page.setViewportSize({ width: 390, height: 844 });
        await panel
          .locator('[data-cv-preparation-state="prepared"]')
          .evaluate((node) => node.scrollIntoView({ block: 'center' }));
        await shot('cv-workplace-prepare-phone');
        await page.setViewportSize({ width: 1280, height: 900 });
      }
    );
    assert.deepEqual(f.errors, []);
    console.log(
      '[cv-workplace-prepare-evidence]',
      JSON.stringify({ cases, ...f.counters, errors: f.errors })
    );
    return { cases };
  } finally {
    await f.close();
  }
};
