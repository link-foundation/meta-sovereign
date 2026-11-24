import { webkit } from 'playwright';
import { verifyVkDesktopPolicy } from '../../js/tests/helpers/e2e-vk-desktop-policy.mjs';
const browser = await webkit.launch({ headless: true });
try {
  console.log(JSON.stringify(await verifyVkDesktopPolicy(browser)));
} finally {
  await browser.close();
}
