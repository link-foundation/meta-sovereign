import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import { applicationNativeHtml } from './application-native-fixture.mjs';
import { readFormDocument } from '../../js/src/forms/read-document.js';

await runBrowserScenarios('application-context-inspection', [
  async (browser) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.route('**/*', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: applicationNativeHtml({ response: true, resumeChooser: true }),
        })
      );
      await page.goto('https://hh.ru/vacancy/123');
      const summarize = async () => {
        const report = await page.evaluate(readFormDocument, {
          maxFields: 200,
          maxOptions: 100,
        });
        return {
          reasons: report.reasons,
          fields: report.fields.map(({ index, type, label }) => ({
            index,
            type,
            labelled: Boolean(label),
          })),
        };
      };
      const closed = await summarize();
      await page.locator('[data-qa="resume-title"]').first().click();
      return { closed, open: await summarize() };
    } finally {
      await context.close();
    }
  },
]);
