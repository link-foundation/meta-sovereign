import { mkdir } from 'node:fs/promises';
import { webkit } from 'playwright';
import { verifyFollowDisclosure } from '../../js/tests/helpers/e2e-follow-disclosure.mjs';

const browser = await webkit.launch({ headless: true });
const directory = 'docs/screenshots/issue-56-ci-follow-layout';
await mkdir(directory, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.setDefaultTimeout(2000);
  console.log(JSON.stringify(await verifyFollowDisclosure(page, directory)));
} finally {
  await browser.close();
}
