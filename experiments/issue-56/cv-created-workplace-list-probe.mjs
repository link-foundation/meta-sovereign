import { chromium } from 'playwright';
import { cvCreatedWorkplaceBrowserFixture } from './cv-created-workplace-browser-fixture.mjs';
import { fetchCvSavedHtml } from '../../js/src/jobs/cv-watch-export.js';
import { readCvWorkplaceListDocument } from '../../js/src/jobs/cv-workplace-created.js';

const browser = await chromium.launch({
  headless: true,
  executablePath: chromium.executablePath(),
});
let fixture;
try {
  fixture = await cvCreatedWorkplaceBrowserFixture(browser);
  for (const saved of [false, true]) {
    if (saved) {
      await fixture.provider
        .locator('textarea')
        .fill('Owner final new workplace description');
      await fixture.provider
        .locator('[data-qa="profile-layout-save-button"]')
        .click();
      await fixture.provider.waitForURL('https://hh.ru/resume/abc123');
    }
    const html = await fixture.provider.evaluate(fetchCvSavedHtml, {
      workplaceList: true,
    });
    const ids = await fixture.provider.evaluate(
      readCvWorkplaceListDocument,
      html
    );
    console.log(
      JSON.stringify({ saved, html, ids, counts: fixture.createdCounters })
    );
  }
} finally {
  await fixture?.close();
  await browser.close();
}
