import { webkit } from 'playwright';
import { verifyVkFriends } from '../../js/tests/helpers/e2e-vk-friends.mjs';
import { verifyVkOnline } from '../../js/tests/helpers/e2e-vk-online.mjs';
const browser = await webkit.launch({ headless: true });
try {
  console.log(
    JSON.stringify({
      friends: await verifyVkFriends(browser),
      online: await verifyVkOnline(browser),
    })
  );
} finally {
  await browser.close();
}
