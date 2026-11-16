import { chromium } from 'playwright';
import { verifyVacancyMetadataVariants } from '../../js/tests/helpers/e2e-vacancy-metadata.mjs';

const browser = await chromium.launch({
  executablePath: '/opt/google/chrome/chrome',
  headless: true,
});
try {
  console.log(
    JSON.stringify(
      await verifyVacancyMetadataVariants(browser, {
        screenshots: process.argv.includes('--before')
          ? 'docs/screenshots/issue-56-vacancy-metadata/before'
          : 'docs/screenshots/issue-56-vacancy-metadata/after',
      })
    )
  );
} finally {
  await browser.close();
}
