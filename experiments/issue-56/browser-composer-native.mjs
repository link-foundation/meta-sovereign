import { chromium } from 'playwright';
import { verifyBrowserComposerDraft } from '../../js/tests/helpers/e2e-browser-composer-draft.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: chromium.executablePath(),
});
try {
  console.log(
    JSON.stringify(
      await verifyBrowserComposerDraft(browser, {
        before: process.env.COMPOSER_BEFORE === '1',
        screenshots: 'docs/case-studies/issue-56/screenshots',
      })
    )
  );
} finally {
  await browser.close();
}
