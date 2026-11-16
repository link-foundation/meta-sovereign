import { experienceDocumentBrowserFixture } from '../../../experiments/issue-56/experience-document-browser-fixture.mjs';
import {
  inspectExperienceDocuments,
  runExperienceDocumentActions,
  experienceDocumentInspectionConfig,
} from '../../../experiments/issue-56/experience-document-inspect.mjs';

export const verifyCvExperienceDocuments = async (browser) => {
  const fixture = await experienceDocumentBrowserFixture();
  const context = await browser.newContext({ acceptDownloads: true });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    return await inspectExperienceDocuments(
      page,
      experienceDocumentInspectionConfig({ base: fixture.base }),
      runExperienceDocumentActions
    );
  } finally {
    await context.close();
    await fixture.close();
  }
};
