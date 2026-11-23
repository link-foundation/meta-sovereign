import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cvWorkplacePrepareBrowserFixture } from '../../../experiments/issue-56/cv-workplace-prepare-browser-fixture.mjs';
import { openCvWatchOriginal } from '../../../experiments/issue-56/cv-watch-transition-owner.mjs';

const qa = (page, name) => page.locator(`[data-qa="${name}"]`);

const fillNewWorkplace = async (provider, job) => {
  await provider.locator('input[name="company"]').fill('New fixture company');
  await provider.locator('input[name="position"]').fill(job.position);
  await qa(provider, 'resume-editor-experience-description-input').fill(
    job.description
  );
  await qa(provider, 'resume-editor-experience-start-month-input')
    .getByRole('button')
    .click();
  await provider.getByRole('option', { name: 'May', exact: true }).click();
  await qa(provider, 'resume-editor-experience-start-year-input').fill('2020');
  await qa(provider, 'resume-editor-experience-present-checkbox').check();
  await qa(provider, 'resume-editor-experience-company-url-input').fill(
    job.website
  );
  await qa(provider, 'resume-editor-experience-area-input').click();
  await provider.getByRole('option', { name: 'Remote', exact: true }).click();
  await qa(provider, 'trigger-root').click();
  const picker = provider.getByRole('dialog', { name: 'Company industries' });
  await qa(picker, 'tree-selector-input-540').check();
  await qa(picker, 'profile-layout-save-button').click();
};

export const verifyCvWatchTransitions = async (
  browser,
  { before = false, screenshots } = {}
) => {
  const f = await cvWorkplacePrepareBrowserFixture(browser, {
    fieldsMode: true,
    copyMode: true,
    followupMode: true,
  });
  const { page, provider, counters, store } = f;
  const source = f.data.sources.find((row) => row.cv.language === 'en');
  const watch = page.locator('[data-cv-save-watch]');
  const state = (name) => watch.locator(`[data-cv-watch-state="${name}"]`);
  const action = (name) => watch.locator(`[data-cv-watch-action="${name}"]`);
  const native = (name) => qa(provider, name);
  const snapshots = () => store.get('jobs-cv-snapshots:jobs');
  const capture = async (name) => {
    if (screenshots) {
      await mkdir(screenshots, { recursive: true });
      await watch.scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(screenshots, `${name}.png`) });
    }
  };
  try {
    await f.open({ screen: 'overview' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${f.base}/#/cv`);
    await action('start').click();
    await state('watching').waitFor();
    const startingNavigations = counters.navigations;
    const overview = provider.url();

    if (!before) {
      await f.open({ screen: 'list' });
      await provider.waitForFunction(() => globalThis.fixtureHydrated);
      const listUrl = provider.url();
      await native('list-add').click();
      await fillNewWorkplace(provider, source.cv.jobs[0]);
      await native(
        `profile-resumes-list-checkbox-${source.identity.hash}`
      ).check();
      assert.equal(provider.url(), listUrl);
      assert.equal(counters.navigations, startingNavigations + 1);
      assert.equal(counters.saves, 0);
      await native('profile-layout-save-button').click();
      await state('saved').waitFor();
      const created = await snapshots();
      assert.deepEqual(
        created.snapshots.map(({ cv, workplace }) => [
          cv.language,
          workplace.recordId,
          workplace.checked,
          cv.jobs.length,
        ]),
        [
          ['en', '987', true, 3],
          ['ru', '987', false, 2],
        ]
      );
      await capture('same-url-add-verified');
    }
    const previous = await snapshots();
    const previousSaves = before ? 0 : 1;
    const previousNavigations = counters.navigations;
    const ownerSave = await openCvWatchOriginal(f, { before });
    assert.equal(counters.navigations, previousNavigations + 2);
    assert.equal(counters.saves, previousSaves);
    await ownerSave.click();

    if (before) {
      await state('saved').waitFor();
      assert.equal((await snapshots()).snapshots[0].workplace.checked, false);
      await capture('stale-detach-accepted');
    }
    await state('not-saved').waitFor({ timeout: 8500 });
    assert.deepEqual(await snapshots(), previous);
    const { requestId } = await store.get('jobs-cv-watch-latest:jobs');
    const outcome = await store.get(`jobs-cv-watch:${requestId}`);
    assert.equal(outcome.code, 'jobs-cv-mismatch');
    assert.equal(outcome.saves, previousSaves);
    await page.reload();
    await state('not-saved').waitFor();
    assert.match(await state('not-saved').innerText(), /previous snapshot/u);
    await capture('stale-detach-refused');
    assert.equal(provider.url(), overview);
    assert.equal(counters.navigations, previousNavigations + 3);
    assert.equal(counters.saves, previousSaves + 1);
    await action('stop').click();
    await state('stopped').waitFor();
    assert.equal(counters.attached, 1);
    assert.equal(counters.detached, 1);
    assert.deepEqual(f.errors, []);
  } finally {
    await f.close();
  }
};
