import { watchFixturePages } from './e2e-page-errors.mjs';
import { linkedinExperienceBrowserFixture } from '../../../experiments/issue-56/linkedin-experience-browser-fixture.mjs';
import {
  inspectLinkedinExperience,
  linkedinInspectionConfig,
} from '../../../experiments/issue-56/linkedin-experience-inspect.mjs';
import { verifyLinkedinAcquisition } from '../../../experiments/issue-56/linkedin-acquisition-native.mjs';
import { verifyLinkedinPositionNative } from '../../../experiments/issue-56/linkedin-position-native.mjs';

export const verifyCvLinkedinExperience = async (browser) => {
  const native = await verifyLinkedinAcquisition(browser);
  const position = await verifyLinkedinPositionNative(browser);
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
