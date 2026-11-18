import { browserOf } from '../../js/tests/helpers/e2e-chat.mjs';
import { verifyVkOnline } from '../../js/tests/helpers/e2e-vk-online.mjs';

const { engine, browserType } = await browserOf('vk-online');
const browser = await browserType.launch({ headless: true });
try {
  console.log(
    JSON.stringify({
      engine,
      ...(await verifyVkOnline(browser, {
        before: process.argv.includes('--before'),
        screenshots: 'docs/screenshots/issue-56-vk-online',
      })),
    })
  );
} finally {
  await browser.close();
}
