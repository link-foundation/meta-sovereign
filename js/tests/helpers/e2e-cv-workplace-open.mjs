import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

export const verifyCvWorkplaceOpening = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser);
  const { page, provider } = f;
  const panel = page.locator('[data-cv-preparation]');
  const button = panel.locator(
    '[data-cv-prepare-change="en:jobs.0.description"]'
  );
  const shot = async (name, target = page) => {
    if (!screenshots) {
      return;
    }
    await mkdir(screenshots, { recursive: true });
    await target.screenshot({ path: join(screenshots, `${name}.png`) });
  };
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-workplace-open', name, work);
    cases++;
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await panel
      .locator('[data-cv-prepare-record="en:jobs.0.description"]')
      .fill('123');
    const baseline = await provider.evaluate(readCvEditorDocument);
    await f.open({ screen: 'overview', delay: 350 });
    await shot('cv-workplace-open-overview', provider);
    const start = f.counters.destinations.length;
    await clickCvPreparation(page, button, before ? 'failed' : 'prepared');
    await panel.scrollIntoViewIfNeeded();
    await shot(`cv-workplace-open-${before ? 'before' : 'after'}`);
    if (before) {
      assert.equal(f.counters.destinations.length, start);
      assert.equal(f.counters.reads, 0);
      assert.fail(
        'The reviewed older workplace must open from the complete native list'
      );
    }
    await run(
      'older workplace opens through the full hydrated list and preserves every other field and Save',
      async () => {
        assert.deepEqual(f.counters.destinations.slice(start), [
          `https://hh.ru/profile/edit/experience?resumeFrom=${f.change.hash}&hhtmFrom=resume`,
          `https://hh.ru/profile/edit/experience/123?resumeFrom=${f.change.hash}&hhtmFrom=resume`,
        ]);
        const record = await provider.evaluate(readCvEditorDocument);
        assert.deepEqual(record, {
          ...baseline,
          url: record.url,
          description: f.change.after,
        });
        assert.equal(
          await provider.evaluate(
            () => globalThis.sessionStorage.fixtureListClicks
          ),
          '1'
        );
        assert.equal(await provider.evaluate(() => globalThis.fixtureSaves), 0);
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureCancels),
          0
        );
        assert.equal(f.counters.reads, 1);
        assert.equal(f.counters.attached, f.counters.detached);
        await shot('cv-workplace-open-native', provider);
        const actions = {
          ...f.counters,
          destinations: [...f.counters.destinations],
        };
        await page.reload();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        assert.deepEqual(f.counters, actions);
        await page.setViewportSize({ width: 390, height: 844 });
        await panel.scrollIntoViewIfNeeded();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > globalThis.innerWidth
          ),
          false
        );
        await shot('cv-workplace-open-phone');
        await page.setViewportSize({ width: 1280, height: 900 });
        await panel
          .locator('[data-cv-prepare-record="en:jobs.0.description"]')
          .fill('123');
      }
    );
    await run(
      'an existing About draft prevents all list navigation and remains untouched',
      async () => {
        await f.open({ screen: 'overview', list: { draft: true } });
        const count = f.counters.navigations;
        await clickCvPreparation(page, button, 'failed');
        assert.match(await panel.textContent(), /jobs-cv-draft/u);
        assert.equal(f.counters.navigations, count);
        assert.equal(
          await provider.locator('textarea').inputValue(),
          'Owner unfinished About draft'
        );
      }
    );
    await run(
      'duplicate, hidden, challenged and wrong-record native lists refuse field writes',
      async () => {
        for (const list of [
          { duplicate: true },
          { hidden: true },
          { challenge: true },
          { wrongRecord: true },
        ]) {
          await f.open({ screen: 'overview', list });
          const reads = f.counters.reads;
          await clickCvPreparation(
            page,
            button,
            list.challenge ? 'failed' : 'uncertain'
          );
          assert.equal(f.counters.reads, reads);
          assert.equal(
            await provider.evaluate(() => globalThis.fixtureInputs),
            0
          );
          assert.equal(
            await provider.evaluate(() => globalThis.fixtureSaves),
            0
          );
          assert.equal(f.counters.attached, f.counters.detached);
        }
      }
    );
    console.log(
      '[cv-workplace-open-receipt]',
      JSON.stringify({
        cases,
        attached: f.counters.attached,
        detached: f.counters.detached,
        saves: f.counters.saves,
        readbacks: f.counters.reads,
      })
    );
    return cases;
  } finally {
    await f.close();
  }
};
