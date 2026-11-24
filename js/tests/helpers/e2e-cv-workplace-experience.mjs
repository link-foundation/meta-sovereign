import assert from 'node:assert/strict';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import {
  completeWorkplaceExperience,
  seedWorkplaceExperience,
} from '../../../experiments/issue-56/cv-workplace-experience-fixture.mjs';
import { readCvEditorDocument } from '../../src/jobs/cv-watch-document.js';
import { cvSaveAttempt } from '../../src/jobs/cv-watch-verification.js';
import { clickCvPreparation } from './e2e-cv-prepare-recovery.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

const stageAfterLostReply = async (page, update) => {
  const endpoint = '**/api/vacancies/cv-workplace-plan';
  const submit = update.locator('button[type="submit"]');
  let requests = 0;
  await page.route(endpoint, async (route) => {
    requests++;
    await route.fetch();
    await route.abort('connectionreset');
  });
  await submit.click();
  await update.getByRole('alert').waitFor();
  assert.equal(requests, 1);
  assert.equal(
    await update.locator('[data-experience-workplace-record]').inputValue(),
    '123'
  );
  await page.unroute(endpoint);
  await submit.click();
};

const verifyPreparedFields = async (provider, matched, hash) => {
  const draft = cvSaveAttempt(await provider.evaluate(readCvEditorDocument));
  assert.equal(draft.recordId, '123');
  assert.equal(draft.description, matched.description);
  assert.equal(draft.area, matched.location);
  assert.equal(draft.end, matched.end);
  assert.equal(draft.current, false);
  assert.deepEqual(
    draft.resumes.filter((row) => row.checked).map((row) => row.hash),
    [hash]
  );
};

const verifyWorkplaceExperience = async (browser) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
    followupMode: true,
    singleTarget: true,
  });
  const { page, provider, store, counters, followup } = f;
  const review = page.locator('[data-experience-workplace-review]');
  const reviewAction = (name) =>
    review.locator(`[data-cv-workplace-action="${name}"]`);
  const watch = page.locator('[data-cv-save-watch]');
  const watchAction = (name) =>
    watch.locator(`[data-cv-watch-action="${name}"]`).click();
  const watchState = (name) =>
    watch.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  try {
    const { hh, linkedin, matched, added } = await seedWorkplaceExperience({
      store,
      sources: f.data.sources,
      artifactRoot: f.data.artifactRoot,
    });
    linkedin.jobs = [matched, added];
    const plan = await completeWorkplaceExperience(store, hh, linkedin);
    const { identity } = f.data.sources.find(({ cv }) => cv.language === 'en');
    const other = f.data.sources.find(({ cv }) => cv.language === 'ru');
    const otherExport = followup.export(other.identity.hash);
    await f.open({ screen: 'overview' });
    await page.goto(`${f.base}/#/cv`);
    await page.locator('[data-experience-documents] summary').first().click();
    const comparison = page.locator('[data-experience-plan]');
    await comparison.locator('[data-experience-plan-to]').selectOption('hh');
    await comparison
      .locator('[data-experience-plan-request]')
      .fill(plan.requestId);
    await comparison.locator('[data-experience-plan-action="status"]').click();
    const update = comparison.locator('[data-experience-plan-kind="update"]');
    await update.locator('[data-experience-workplace-select]').click();
    await update.locator('[data-experience-workplace-record]').fill('123');
    await stageAfterLostReply(page, update);
    await review.locator('[data-cv-workplace-plan="draft"]').waitFor();
    await update.getByRole('button', { name: 'Open workplace review' }).click();
    assert.equal(
      await review.evaluate((node) => node === document.activeElement),
      true
    );
    assert.equal(await reviewAction('prepare').count(), 0);
    assert.equal(counters.attached, 0);
    assert.equal(counters.saves, 0);

    await reviewAction('approve').click();
    await review.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await review.locator('[data-cv-workplace-plan="reviewed"]').waitFor();
    const geometry = await review.evaluate((node) => ({
      width: node.clientWidth,
      scroll: node.scrollWidth,
    }));
    assert.ok(geometry.scroll <= geometry.width + 1);
    await clickCvPreparation(page, reviewAction('prepare'), 'prepared');
    await verifyPreparedFields(provider, matched, identity.hash);
    assert.equal(counters.saves, 0);

    await watchAction('start');
    await watchState('watching');
    await provider.locator('[data-qa="profile-layout-save-button"]').click();
    await watchState('saved');
    const { snapshots } = await store.get('jobs-cv-snapshots:jobs');
    const saved = snapshots.find((row) => row.hash === identity.hash);
    assert.equal(saved.workplace.recordId, '123');
    assert.equal(saved.cv.jobs[0].description, matched.description);
    assert.equal(saved.cv.jobs[1].company, 'Unrelated workplace');
    assert.equal(followup.export(other.identity.hash), otherExport);
    assert.equal(counters.saves, 1);
    await watchAction('stop');
    await watchState('stopped');
    assert.equal(counters.attached, counters.detached);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
};

export const verifyCvWorkplaceExperience = (browser) =>
  traceBrowserScenario(
    'cv-workplace-experience',
    'review, prepare and verify one owner Save',
    () => verifyWorkplaceExperience(browser)
  );
