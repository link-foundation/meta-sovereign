import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const verifyFollowup = async (browser, { stale, before, screenshots }) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
    copyMode: true,
    followupMode: true,
  });
  const { page, provider, store, followup, counters } = f;
  const { identity } = f.data.sources.find(({ cv }) => cv.language === 'en');
  const panel = page.locator('[data-cv-workplace-review]');
  const watch = page.locator('[data-cv-save-watch]');
  const action = (name) =>
    panel.locator(`[data-cv-workplace-action="${name}"]`);
  const state = (name) => watch.locator(`[data-cv-watch-state="${name}"]`);
  const watchAction = (name) =>
    watch.locator(`[data-cv-watch-action="${name}"]`).click();
  const snapshots = () => store.get('jobs-cv-snapshots:jobs');
  const reviews = async (operation) => {
    await panel
      .locator('[data-cv-workplace-operation]')
      .selectOption(operation);
    await action('loadMembership').click();
    await panel.locator('[data-cv-workplace-membership]').waitFor();
    await action('propose').click();
    await panel.locator('[data-cv-workplace-plan="draft"]').waitFor();
    assert.equal(await action('prepare').count(), 0);
    await action('approve').click();
    await panel.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
    await clickCvPreparation(page, action('prepare'), 'prepared');
  };
  const nativeSave = () =>
    provider.locator('[data-qa="profile-layout-save-button"]').click();
  const capture = async (name, section = watch) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await section.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  const selection = (id) => {
    const { target, shared } = followup.record(id);
    return [target, shared];
  };
  try {
    await f.open({ screen: 'overview' });
    await page.goto(`${f.base}/#/cv`);
    await panel
      .locator('[data-cv-workplace-export]')
      .selectOption(`${identity.exportId}:${identity.hash}`);
    await action('loadSource').click();
    await panel.locator('[data-cv-workplace-record]').fill('123');
    await reviews('copy');
    assert.equal(counters.saves, 0);
    await watchAction('start');
    await state('watching').waitFor();
    await nativeSave();
    await state('saved').waitFor();
    const copied = await snapshots();
    const target = (value) =>
      value.snapshots.find((row) => row.hash === identity.hash);
    const other = (value) =>
      value.snapshots.find((row) => row.hash !== identity.hash);
    assert.equal(target(copied).workplace.recordId, '987');
    assert.equal(target(copied).cv.jobs.length, 3);
    assert.equal(other(copied).cv.jobs.length, 2);
    assert.deepEqual(selection('123'), [true, true]);
    assert.deepEqual(selection('987'), [true, false]);
    await capture('copy-saved-before-detach');
    await watchAction('stop');
    await state('stopped').waitFor();
    await f.open({ context: true });
    await reviews('detach');
    assert.equal(counters.saves, 1);
    assert.deepEqual(selection('123'), [true, true]);
    await capture('separate-detach-review', panel);
    await watchAction('start');
    await state('watching').waitFor();
    if (stale) {
      followup.keepOriginalInExport();
    }
    await nativeSave();
    if (before) {
      await state('saved').waitFor();
      await page.reload();
      await state('saved').waitFor();
      await watch.getByText(/Verified workplace record: 123/u).waitFor();
      await capture('stale-detach-before');
      assert.deepEqual(
        await snapshots(),
        copied,
        'Stale target CV export must preserve the last verified snapshot'
      );
    }
    if (stale) {
      await state('not-saved').waitFor();
      assert.deepEqual(await snapshots(), copied);
      await capture('stale-detach-after');
    } else {
      await state('saved').waitFor();
      const detached = await snapshots();
      assert.equal(target(detached).workplace.recordId, '123');
      assert.equal(target(detached).workplace.checked, false);
      assert.deepEqual(
        target(detached).cv.jobs,
        target(copied).cv.jobs.slice(1)
      );
      assert.deepEqual(other(detached).cv.jobs, other(copied).cv.jobs);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await state('saved').waitFor();
      await capture('detach-saved-phone');
    }
    assert.deepEqual(selection('123'), [false, true]);
    assert.deepEqual(selection('987'), [true, false]);
    assert.equal(counters.saves, 2);
    await watchAction('stop');
    await state('stopped').waitFor();
    assert.equal(counters.attached, counters.detached);
    assert.deepEqual(f.errors, []);
    return {
      nativeOwnerSaves: counters.saves,
      staleExport: stale,
      authenticatedProvider: false,
    };
  } finally {
    await f.close();
  }
};

export const verifyCvWorkplaceFollowup = async (browser, options = {}) => {
  for (const stale of options.before ? [true] : [false, true]) {
    await traceBrowserScenario(
      'cv-workplace-followup',
      stale ? 'stale detach' : 'fresh detach',
      () => verifyFollowup(browser, { ...options, stale })
    );
  }
};
