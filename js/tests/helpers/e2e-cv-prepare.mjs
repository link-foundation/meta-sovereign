import assert from 'node:assert/strict';
import {
  verifyCvPreparationRecovery,
  clickCvPreparation,
} from './e2e-cv-prepare-recovery.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvPrepareBrowserFixture } from '../../../experiments/issue-56/cv-prepare-browser-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

export const verifyCvPreparation = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvPrepareBrowserFixture(browser);
  const { page, provider, change } = f;
  const panel = page.locator('[data-cv-preparation]');
  const prepare = panel.locator('[data-cv-prepare-change="en:about"]');
  const reload = panel.locator('[data-cv-prepare-reload]');
  const status = (state) =>
    panel.locator(`[data-cv-preparation-state="${state}"]`).waitFor();
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-prepare', name, work);
    cases++;
  };
  const shot = async (name, target = page) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await target.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await page.locator('[data-cv-technology-plan]').waitFor();
    if (before) {
      await page
        .locator('[data-cv-technology-review]')
        .evaluate((node) => node.scrollIntoView({ block: 'end' }));
      await shot('cv-prepare-before');
      assert.equal(
        await panel.count(),
        1,
        'The CV review must expose native About preparation'
      );
      return;
    }
    await panel.waitFor();
    await run(
      'saved review hydrates and prepares the exact native About draft with no Save or navigation',
      async () => {
        await f.open({ delay: 500 });
        const navigations = f.counters.navigations;
        await clickCvPreparation(page, prepare, 'prepared');
        assert.equal(
          await provider.locator('textarea').inputValue(),
          change.after
        );
        assert.deepEqual(
          await provider.evaluate(() => ({
            saves: globalThis.fixtureSaves,
            opens: globalThis.fixtureOpeners,
            cancelled: globalThis.fixtureCancels,
          })),
          { saves: 0, opens: 1, cancelled: 0 }
        );
        assert.equal(f.counters.navigations, navigations);
        assert.equal(f.counters.attached, f.counters.detached);
        await shot('cv-prepare-native', provider);
        await panel.scrollIntoViewIfNeeded();
        await shot('cv-prepare-desktop');
      }
    );
    await run(
      'an existing owner-edited draft is preserved without another opener or keyboard event',
      async () => {
        await provider
          .locator('textarea')
          .fill('Owner draft after preparation');
        const inputs = await provider.evaluate(() => globalThis.fixtureInputs);
        await clickCvPreparation(page, prepare, 'failed');
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Owner draft after preparation'
        );
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureInputs),
          inputs
        );
        assert.match(await panel.textContent(), /jobs-cv-draft/u);
      }
    );
    await run(
      'wrong CV refuses opening and a changed saved baseline leaves the native text untouched',
      async () => {
        await f.open({ hash: 'wrong123' });
        await clickCvPreparation(page, prepare, 'failed');
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureOpeners),
          0
        );
        await f.open({ about: 'Changed provider baseline' });
        await clickCvPreparation(page, prepare, 'uncertain');
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Changed provider baseline'
        );
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureInputs),
          0
        );
        assert.match(await panel.textContent(), /jobs-cv-baseline/u);
      }
    );
    await run(
      'native maxlength preparation preserves the final code point and never presses Save',
      async () => {
        await f.open({ maxLength: change.after.length });
        await clickCvPreparation(page, prepare, 'prepared');
        assert.equal(
          await provider.locator('textarea').inputValue(),
          change.after
        );
        assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
      }
    );
    await verifyCvPreparationRecovery({
      run,
      f,
      prepare,
      page,
      panel,
      reload,
      status,
      shot,
    });
    assert.deepEqual(f.errors, []);
    assert.equal(f.records.length, 0);
    console.log(
      '[cv-prepare-evidence]',
      JSON.stringify({
        cases,
        ...f.counters,
        nativeSaves: await provider.evaluate(() => globalThis.fixtureSaves),
        errors: f.errors,
      })
    );
  } finally {
    await f.close();
  }
};
