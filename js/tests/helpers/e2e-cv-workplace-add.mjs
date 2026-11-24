import assert from 'node:assert/strict';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { cvSaveAttempt } from '../../src/jobs/cv-watch-verification.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

export const verifyCvWorkplaceAdd = async (browser) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
    addMode: true,
  });
  const { page, provider, store, counters, followup } = f;
  const { identity, cv } = f.data.sources.find(
    (row) => row.cv.language === 'en'
  );
  const panel = page.locator('[data-cv-workplace-review]');
  const action = (name) =>
    panel.locator(`[data-cv-workplace-action="${name}"]`);
  const field = (name) => panel.locator(`[data-cv-workplace-field="${name}"]`);
  const watch = page.locator('[data-cv-save-watch]');
  const watchAction = (name) =>
    watch.locator(`[data-cv-watch-action="${name}"]`);
  const watchState = (name) => watch.locator(`[data-cv-watch-state="${name}"]`);
  const prepare = (state) => clickCvPreparation(page, action('prepare'), state);
  const open = (options) => f.open({ screen: 'overview', ...options });
  const details = {
    company: 'Northstar Systems',
    position: 'Platform Engineer',
    description: 'Built reliable workflows.\nDocumented incident response.',
    website: 'https://northstar.example.org',
    start: '2019-03',
    end: '2024-08',
  };
  try {
    assert.deepEqual(cv.jobs, []);
    await open({ list: { newShared: true } });
    await page.goto(`${f.base}/#/cv`);
    await panel.locator('[data-cv-workplace-operation]').selectOption('add');
    await panel
      .locator('[data-cv-workplace-export]')
      .selectOption(`${identity.exportId}:${identity.hash}`);
    await action('loadAddSource').click();
    assert.equal(
      await panel
        .locator('[data-cv-workplace-job],[data-cv-workplace-record]')
        .count(),
      0
    );
    await field('company').waitFor();
    assert.equal(await field('company').inputValue(), '');
    assert.equal(await action('propose').isDisabled(), true);
    for (const [name, value] of Object.entries(details)) {
      await field(name).fill(value);
    }
    await field('areaId').selectOption('2');
    await panel.locator('[data-cv-workplace-industry="7.540"]').check();
    await action('propose').click();
    await panel.locator('[data-cv-workplace-plan="draft"]').waitFor();
    assert.equal(await action('prepare').count(), 0);
    await action('approve').click();
    await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();

    await traceBrowserScenario(
      'cv-workplace-add',
      'refuse selection of another CV before typing',
      async () => {
        await prepare('uncertain');
        assert.equal(
          await provider.locator('input[name="company"]').inputValue(),
          ''
        );
        assert.equal(counters.saves, 0);
        const { resumes } = await provider.evaluate(readCvEditorDocument);
        assert.deepEqual(
          resumes.filter((row) => row.checked).map((row) => row.hash),
          [f.data.sources.find((row) => row.cv.language === 'ru').identity.hash]
        );
      }
    );

    await traceBrowserScenario(
      'cv-workplace-add',
      'prepare the empty CV and verify the native owner Save',
      async () => {
        await open();
        await prepare('prepared');
        const native = cvSaveAttempt(
          await provider.evaluate(readCvEditorDocument)
        );
        assert.equal(native.recordId, null);
        for (const [name, value] of Object.entries(details)) {
          assert.equal(native[name], value);
        }
        assert.equal(native.current, false);
        assert.equal(native.area, 'Moscow');
        assert.equal(native.industryText, 'Software');
        assert.deepEqual(
          native.resumes.filter((row) => row.checked),
          [{ hash: identity.hash, checked: true }]
        );
        assert.equal(counters.saves, 0);
        assert.equal(
          await provider.evaluate(() => globalThis.fixtureCancels),
          0
        );

        await watchAction('start').click();
        await watchState('watching').waitFor();
        await provider
          .locator('[data-qa="profile-layout-save-button"]')
          .click();
        await watchState('saved').waitFor({ timeout: 8000 });
        const { snapshots } = await store.get('jobs-cv-snapshots:jobs');
        const target = snapshots.find((row) => row.hash === identity.hash);
        const other = snapshots.find((row) => row.hash !== identity.hash);
        assert.equal(target.workplace.recordId, '987');
        assert.deepEqual(
          target.cv.jobs.map((job) => job.company),
          [details.company]
        );
        assert.deepEqual(
          other.cv.jobs.map((job) => job.company),
          ['ArtBridge', 'Unrelated workplace']
        );
        assert.equal(followup.record('123').target, false);
        assert.equal(followup.record('987').shared, false);
        assert.equal(counters.saves, 1);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
        await panel.locator('[data-cv-preparation-state="prepared"]').waitFor();
        await watchState('saved').waitFor();
        await watchAction('stop').click();
        await watchState('stopped').waitFor();
      }
    );
    assert.equal(counters.attached, counters.detached);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
};
