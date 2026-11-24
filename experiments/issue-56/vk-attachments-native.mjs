import { browserOf } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyVkAttachments } from '../../js/tests/helpers/e2e-vk-attachments.mjs';

const { engine, browserType } = await browserOf('vk-attachments');
const browser = await browserType.launch({ headless: true });
try {
  const result = await verifyVkAttachments(browser, {
    before: process.argv.includes('--before'),
    screenshots: 'docs/screenshots/issue-56-vk-attachments',
  });
  console.log(JSON.stringify({ engine, ...result }));
} finally {
  await browser.close();
}
