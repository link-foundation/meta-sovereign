import { watchFixturePages } from './e2e-page-errors.mjs';
import { experiencePlanBrowserFixture } from '../../../experiments/issue-56/experience-plan-browser-fixture.mjs';
import {
  inspectExperiencePlan,
  experiencePlanInspectionConfig,
} from '../../../experiments/issue-56/experience-plan-inspect.mjs';

export const verifyCvExperiencePlans = async (browser) => {
  const fixture = await experiencePlanBrowserFixture();
  const context = await browser.newContext({ acceptDownloads: true });
  const errors = [];
  watchFixturePages(context, browser, fixture.base, errors);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    return await inspectExperiencePlan(
      page,
      experiencePlanInspectionConfig({
        base: fixture.base,
        input: fixture.input,
      }),
      undefined,
      errors
    );
  } finally {
    await context.close();
    await fixture.close();
  }
};
