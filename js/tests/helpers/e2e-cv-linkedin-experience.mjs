import { linkedinExperienceBrowserFixture } from '../../../experiments/issue-56/linkedin-experience-browser-fixture.mjs';
import {
  inspectLinkedinExperience,
  linkedinInspectionConfig,
} from '../../../experiments/issue-56/linkedin-experience-inspect.mjs';
import { verifyLinkedinAcquisition } from '../../../experiments/issue-56/linkedin-acquisition-native.mjs';

export const verifyCvLinkedinExperience = async (browser) => {
  const native = await verifyLinkedinAcquisition(browser);
  const fixture = await linkedinExperienceBrowserFixture();
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    return {
      native,
      ui: await inspectLinkedinExperience(
        page,
        linkedinInspectionConfig({ base: fixture.base })
      ),
    };
  } finally {
    await context.close();
    await fixture.close();
  }
};
