import assert from 'node:assert/strict';
import { watchFixturePages } from './e2e-page-errors.mjs';
import { linkedinExperienceBrowserFixture } from '../../../experiments/issue-56/linkedin-experience-browser-fixture.mjs';
import {
  inspectLinkedinExperience,
  linkedinInspectionConfig,
} from '../../../experiments/issue-56/linkedin-experience-inspect.mjs';
import { verifyLinkedinAcquisition } from '../../../experiments/issue-56/linkedin-acquisition-native.mjs';
import { verifyLinkedinPositionNative } from '../../../experiments/issue-56/linkedin-position-native.mjs';
import { verifyLinkedinPositionJob } from '../../../experiments/issue-56/linkedin-position-job-native.mjs';
import { linkedinPositionReviewBrowserFixture } from '../../../experiments/issue-56/linkedin-position-review-browser-fixture.mjs';
import { inspectLinkedinPositionReview } from '../../../experiments/issue-56/linkedin-position-review-inspect.mjs';

export const verifyCvLinkedinPositionReview = async (browser) => {
  const fixture = await linkedinPositionReviewBrowserFixture();
  const context = await browser.newContext();
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const result = await inspectLinkedinPositionReview(page, fixture);
    assert.deepEqual(fixture.counters, {
      opened: 1,
      saved: 0,
      cancelled: 1,
      detached: 1,
    });
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await context.close();
    await fixture.close();
  }
};

export const verifyCvLinkedinExperience = async (browser) => {
  const native = await verifyLinkedinAcquisition(browser);
  const position = await verifyLinkedinPositionNative(browser);
  const positionJob = await verifyLinkedinPositionJob(browser);
  const positionReview = await verifyCvLinkedinPositionReview(browser);
  const fixture = await linkedinExperienceBrowserFixture();
  const context = await browser.newContext({ acceptDownloads: true });
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    return {
      native,
      position,
      positionJob,
      positionReview,
      ui: await inspectLinkedinExperience(
        page,
        linkedinInspectionConfig({ base: fixture.base }),
        undefined,
        errors
      ),
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
