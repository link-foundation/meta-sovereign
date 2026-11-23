import assert from 'node:assert/strict';
import { experienceAutoBrowserFixture } from '../../../experiments/issue-56/experience-auto-browser-fixture.mjs';
import {
  experienceAutoInspectionConfig,
  inspectExperienceAuto,
} from '../../../experiments/issue-56/experience-auto-inspect.mjs';
import { watchFixturePages } from './e2e-page-errors.mjs';

export const verifyCvExperienceAuto = async (browser) => {
  const fixture = await experienceAutoBrowserFixture();
  const context = await browser.newContext();
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const result = await inspectExperienceAuto(
      page,
      experienceAutoInspectionConfig({
        base: fixture.base,
        input: fixture.input,
        screenshots: process.env.EXPERIENCE_AUTO_SCREENSHOTS,
        beforeBundle: process.env.EXPERIENCE_AUTO_BEFORE_BUNDLE,
      })
    );
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await context.close();
    await fixture.close();
  }
};
