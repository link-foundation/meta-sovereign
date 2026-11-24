// Replay the captured native diagnostic against the actual five watch scenarios.
// Chromium supplies the finite fixture; only the diagnostic policy uses WebKit.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyQuestionBrowserWatch } from '../../js/tests/helpers/e2e-question-browser-watch.mjs';

const browser = await chromium.launch({
  executablePath:
    process.env.E2E_EXECUTABLE_PATH ?? '/opt/google/chrome/chrome',
  headless: true,
  args: ['--disable-dev-shm-usage'],
});
let replayed = 0;
const replay = {
  browserType: () => ({ name: () => 'webkit' }),
  newContext: async (...args) => {
    const context = await browser.newContext(...args);
    context.on('page', (page) => {
      page.on('domcontentloaded', () => {
        const url = new URL(page.url());
        if (url.hostname !== '127.0.0.1' || replayed) {
          return;
        }
        replayed++;
        const error = new Error(
          `/${url.host}/api/status?probe=1 due to access control checks.`
        );
        error.name = 'Fetch API cannot load http';
        page.emit('pageerror', error);
      });
    });
    return context;
  },
};
try {
  const result = await verifyQuestionBrowserWatch(replay);
  assert.equal(replayed, 1);
  console.log(
    '[native-diagnostic-replay]',
    JSON.stringify({ replayed, ...result })
  );
} finally {
  await browser.close();
}
