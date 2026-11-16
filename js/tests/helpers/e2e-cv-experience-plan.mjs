import { experiencePlanBrowserFixture } from '../../../experiments/issue-56/experience-plan-browser-fixture.mjs';
import {
  inspectExperiencePlan,
  experiencePlanInspectionConfig,
} from '../../../experiments/issue-56/experience-plan-inspect.mjs';

export const verifyCvExperiencePlans = async (browser) => {
  const fixture = await experiencePlanBrowserFixture();
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    return await inspectExperiencePlan(
      page,
      experiencePlanInspectionConfig({
        base: fixture.base,
        input: fixture.input,
      })
    );
  } finally {
    await context.close();
    await fixture.close();
  }
};
