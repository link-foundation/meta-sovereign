import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import {
  installResumeInputTrace,
  readResumeInputTrace,
} from '../../js/tests/helpers/e2e-resume-input.mjs';

// One native input, finite waits, one isolated context; no provider traffic.
const browser = await webkit.launch({ headless: true });
try {
  const fixture = await vacancyBrowserFixture(browser);
  const { page } = fixture;
  try {
    await installResumeInputTrace(page, true);
    await page.goto(`${fixture.base}/#/cv`);
    await page.locator('[data-vacancies]').waitFor();
    await page.locator('[data-vacancy-field="resume"]').fill('invalid/hash');
    await page.waitForFunction(
      () => document.querySelector('[data-vacancy-action="search"]')?.disabled
    );
    assert.equal(
      await page.locator('[data-vacancy-field="resume"]').inputValue(),
      'invalid/hash'
    );
    assert.deepEqual(fixture.errors, []);
    console.log('Invalid résumé hash validation passed in isolated WebKit.');
  } finally {
    console.log(JSON.stringify(await page.evaluate(readResumeInputTrace)));
    await mkdir('ci-logs', { recursive: true });
    await page.screenshot({
      path: 'ci-logs/resume-validation-probe.png',
      fullPage: true,
    });
    await fixture.close();
  }
} finally {
  await browser.close();
}
