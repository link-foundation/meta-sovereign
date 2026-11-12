import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { cvSaveAttempt } from '../../src/jobs/cv-watch-verification.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

export const verifyCvWorkplaceMembership = async (
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
  const shot = async (name, target = page) => {
    if (!screenshots) {
      return;
    }
    await mkdir(screenshots, { recursive: true });
    await target.screenshot({
      path: join(screenshots, `${name}.png`),
      fullPage: target === provider,
    });
  };
  const open = async (options = {}) => {
    await f.open({ shared: true, membershipMode: true, ...options });
    await provider.waitForFunction(() => globalThis.fixtureHydrated);
  };
  let cases = 0;
  const run = async (name, work) => {
    await traceBrowserScenario('cv-workplace-membership', name, work);
    cases++;
  };
  try {
    await page.goto(`${f.base}/#/cv`);
    await panel.waitFor();
    if (before) {
      await panel.scrollIntoViewIfNeeded();
      await shot('cv-workplace-membership-before');
      assert.equal(
        await panel
          .locator('[data-cv-workplace-operation] option[value="detach"]')
          .count(),
        1,
        'Shared workplaces need separately reviewed target-CV deselection'
      );
      return;
    }
    await run(
      'read complete unchanged native membership and explicitly review target-only deselection',
      async () => {
        const { identity } = f.data.sources.find(
          (row) => row.identity.language === 'en'
        );
        await panel
          .locator('[data-cv-workplace-export]')
          .selectOption(`${identity.exportId}:${identity.hash}`);
        await panel.locator('[data-cv-workplace-action="loadSource"]').click();
        await panel.locator('[data-cv-workplace-fields]').waitFor();
        await panel.locator('[data-cv-workplace-record]').fill('123');
        await panel
          .locator('[data-cv-workplace-operation]')
          .selectOption('detach');
        await open({ delay: 300 });
        const baseline = await read();
        await panel
          .locator('[data-cv-workplace-action="loadMembership"]')
          .click();
        await panel.locator('[data-cv-workplace-membership]').waitFor();
        assert.deepEqual(await read(), baseline);
        await panel.locator('[data-cv-workplace-action="propose"]').click();
        await panel.locator('[data-cv-workplace-plan="draft"]').waitFor();
        assert.equal(await prepare.count(), 0);
        await panel.locator('[data-cv-workplace-action="approve"]').click();
        await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
        const navigations = f.counters.navigations;
        await clickCvPreparation(page, prepare, 'prepared');
        assert.deepEqual(await read(), {
          ...baseline,
          resumes: baseline.resumes.map((row) =>
            row.hash === f.change.hash ? { ...row, checked: false } : row
          ),
        });
        assert.equal(f.counters.navigations, navigations);
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureInputs),
          0
        );
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureCancels),
          0
        );
        await shot('cv-workplace-membership-native', provider);
        await panel
          .locator('[data-cv-workplace-plan]')
          .scrollIntoViewIfNeeded();
        await shot('cv-workplace-membership-desktop');
      }
    );
    await run(
      'stale membership, another saved record and unsaved fields refuse without touching the draft',
      async () => {
        for (const options of [
          { shared: false },
          { recordId: '456' },
          { saved: { company: 'Other saved employer' } },
        ]) {
          await open(options);
          const baseline = await read();
          const reply = page.waitForResponse((response) =>
            response.url().endsWith('/api/vacancies/cv-workplace-membership')
          );
          await panel
            .locator('[data-cv-workplace-action="loadMembership"]')
            .click();
          assert.equal((await reply).ok(), false);
          await page.locator('[data-vacancy-error]').waitFor();
          await panel
            .locator('[data-cv-workplace-action="loadMembership"]:enabled')
            .waitFor();
          assert.equal(
            await panel.locator('[data-cv-workplace-membership]').count(),
            0
          );
          assert.deepEqual(await read(), baseline);
          await clickCvPreparation(page, prepare, 'failed');
          assert.deepEqual(await read(), baseline);
        }
      }
    );
    await run('owner editing during saved read survives refusal', async () => {
      await open();
      f.beforeRead(() =>
        provider
          .locator('input[name="company"]')
          .fill('Owner during membership read')
      );
      await clickCvPreparation(page, prepare, 'failed');
      assert.equal(
        await provider.locator('input[name="company"]').inputValue(),
        'Owner during membership read'
      );
      assert.ok((await read()).resumes.every((row) => row.checked));
    });
    await run(
      'concurrent owner field and selection changes are preserved without restoration',
      async () => {
        await open();
        await provider.evaluate(() => {
          globalThis.fixtureMembershipConcurrentOwner = true;
        });
        await clickCvPreparation(page, prepare, 'uncertain');
        assert.equal(
          await provider.locator('input[name="company"]').inputValue(),
          'Owner revised company'
        );
        assert.ok((await read()).resumes.every((row) => !row.checked));
      }
    );
    await run(
      'unhydrated selection refuses without typing or saving',
      async () => {
        await open({ membershipMode: false });
        const baseline = await read();
        await clickCvPreparation(page, prepare, 'uncertain');
        assert.deepEqual(await read(), baseline);
      }
    );
    await run(
      'lost preparation reply recovers by GET on the phone without another attachment',
      async () => {
        await open();
        let posts = 0;
        await page.route('**/api/vacancies/cv-prepare', async (route) => {
          posts++;
          await route.fetch();
          await route.abort('failed');
        });
        await prepare.click();
        await page.locator('[data-vacancy-error]').waitFor();
        await page.unroute('**/api/vacancies/cv-prepare');
        const attached = f.counters.attached;
        const baseline = await read();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        await panel.locator('[data-cv-workplace-action="status"]').click();
        assert.deepEqual(await read(), baseline);
        assert.equal(f.counters.attached, attached);
        assert.equal(posts, 1);
        assert.equal(
          await panel.locator('[data-cv-workplace-operation]').inputValue(),
          'detach'
        );
        const geometry = await panel.evaluate((node) => ({
          width: node.clientWidth,
          scroll: node.scrollWidth,
        }));
        assert.ok(geometry.scroll <= geometry.width + 1);
        await panel
          .locator('[data-cv-workplace-plan]')
          .scrollIntoViewIfNeeded();
        await shot('cv-workplace-membership-phone');
      }
    );
    assert.equal(f.counters.saves, 0);
    assert.equal(f.counters.attached, f.counters.detached);
    assert.deepEqual(f.errors, []);
    console.log(
      '[cv-workplace-membership]',
      JSON.stringify({ cases, ...f.counters })
    );
  } finally {
    await f.close();
  }
};
