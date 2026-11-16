import { experienceBrowserFixture } from '../../../experiments/issue-56/experience-browser-fixture.mjs';
import { inspectExperience } from '../../../experiments/issue-56/experience-inspect.mjs';
import { inspectCvLoading } from '../../../experiments/issue-56/cv-loading-inspect.mjs';
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_VERSION,
} from '../../src/web/tutorial.js';

export const verifyCvExperience = async (browser) => {
  const fixture = await experienceBrowserFixture();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await inspectCvLoading(page, {
      base: fixture.base,
      key: TUTORIAL_STORAGE_KEY,
      version: TUTORIAL_VERSION,
    });
    return await inspectExperience(page, {
      base: fixture.base,
      key: TUTORIAL_STORAGE_KEY,
      version: TUTORIAL_VERSION,
    });
  } finally {
    await context.close();
    await fixture.close();
  }
};
