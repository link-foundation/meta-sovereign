import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { cvSaveWatchBrowserFixture } from '../../../experiments/issue-56/cv-watch-browser-fixture.mjs';
import {
  cvWatchWorkplaceHtml,
  cvWatchWorkplaceExport,
} from '../../../experiments/issue-56/cv-watch-workplace-fixture.mjs';
import { resumeIndustriesFixture } from '../../../experiments/issue-56/resume-export-fixture.mjs';
import { traceBrowserScenario } from './e2e-browser-scenarios.mjs';

export const verifyCvWatchWorkplace = async (browser, { screenshots } = {}) => {
  const fixture = await cvSaveWatchBrowserFixture(browser);
  const { page, provider, store } = fixture;
  const view = page.locator('[data-cv-save-watch]');
  const status = (name) =>
    view.locator(`[data-cv-watch-state="${name}"]`).waitFor();
  const url = 'https://hh.ru/profile/edit/experience/123';
  let description = '';
  let mismatch = false;
  await store.put({
    id: 'jobs-industries:en',
    version: 1,
    fetchedAt: Date.now(),
    tree: resumeIndustriesFixture('en'),
  });
  await provider
    .context()
    .route('**/profile/edit/experience/123', (route) =>
      route.fulfill({ contentType: 'text/html', body: cvWatchWorkplaceHtml() })
    );
  await provider.context().route('**/fixture/workplace', (route) => {
    description = route.request().postData();
    return route.fulfill({ status: 200, body: 'Saved' });
  });
  await provider.context().route('**/resume_converter/resume.txt?**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: cvWatchWorkplaceExport(description, mismatch),
    })
  );
  try {
    await provider.goto(url);
    await page.goto(`${fixture.base}/#/cv`);
    await status('none');
    await view.locator('[data-cv-watch-action="start"]').click();
    await status('watching');
    await traceBrowserScenario(
      'cv-save-watch',
      'trusted workplace Save reads final prose, dates and complete visible company metadata',
      async () => {
        await provider
          .locator('textarea')
          .fill('Final owner workplace description');
        await provider
          .locator('[data-qa="profile-layout-save-button"]')
          .click();
        await status('saved');
        const saved = (await store.get('jobs-cv-snapshots:jobs')).snapshots[0];
        assert.equal(
          saved.cv.jobs[0].description,
          'Final owner workplace description'
        );
        assert.equal(saved.cv.jobs[0].start, '2020-05');
        assert.equal(saved.cv.jobs[0].industries[0].id, '7.540');
        if (screenshots) {
          await mkdir(screenshots, { recursive: true });
          await view.locator('[data-cv-saved-snapshot] > summary').click();
          await view.scrollIntoViewIfNeeded();
          await page.screenshot({
            path: path.join(screenshots, 'cv-save-watch-workplace.png'),
          });
        }
      }
    );
    await traceBrowserScenario(
      'cv-save-watch',
      'a saved company metadata mismatch retains the earlier verified workplace snapshot',
      async () => {
        const previous = (await store.get('jobs-cv-snapshots:jobs'))
          .snapshots[0].sha256;
        mismatch = true;
        await provider.goto(url);
        await provider
          .locator('textarea')
          .fill('Later mismatched owner description');
        await provider
          .locator('[data-qa="profile-layout-save-button"]')
          .click();
        await status('not-saved');
        assert.equal(
          (await store.get('jobs-cv-snapshots:jobs')).snapshots[0].sha256,
          previous
        );
      }
    );
    assert.deepEqual(fixture.errors, []);
    return { cases: 2, verifiedWorkplace: true, mismatchRetained: true };
  } finally {
    await fixture.close();
  }
};
