import { formalReportBrowserFixture } from '../../../experiments/issue-56/formal-report-browser-fixture.mjs';
import {
  inspectFormalReport,
  formalReportInspectionConfig,
} from '../../../experiments/issue-56/formal-report-inspect.mjs';

export const verifyCvFormalReports = async (browser) => {
  const fixture = await formalReportBrowserFixture();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const result = await inspectFormalReport(
      page,
      formalReportInspectionConfig({
        base: fixture.base,
        planRequestId: fixture.planRequestId,
      })
    );
    if (fixture.writes() !== 1) {
      throw new Error('Exactly one explicit mock publication is required');
    }
    return result;
  } finally {
    await context.close();
    await fixture.close();
  }
};
