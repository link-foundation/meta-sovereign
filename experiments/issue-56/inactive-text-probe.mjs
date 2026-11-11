// One isolated native HH-shaped text send in a background full-Chrome tab.
// Observe platform focus/events before introducing an inactive write policy.
import { chromium } from 'playwright';
import { withHhBrowserScanFixture } from '../../js/tests/helpers/e2e-hh-chat-scan.mjs';
import { prepareBrowserInactiveView } from '../../js/src/sources/browser-inactive-view.js';
import { textReplyHtml, textReplyBody } from './text-reply-fixture.mjs';

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/google/chrome/chrome',
});
try {
  for (const activation of ['pointer', 'dom']) {
    await withHhBrowserScanFixture(
      browser,
      { html: textReplyHtml, choiceReceiptMs: 200 },
      async ({ sender, page, commander }) => {
        const click = commander.clickButton.bind(commander);
        commander.clickButton = (options) =>
          click({ ...options, activation, scroll: 'none' });
        const handle = await sender.openAnswerWatch({
          source: 'hh',
          chat: '7',
        });
        try {
          const expected = await handle.read();
          await prepareBrowserInactiveView(page);
          await page.evaluate(() => {
            window.probeEvents = [];
            for (const type of [
              'pointerdown',
              'mousedown',
              'click',
              'input',
              'focus',
            ]) {
              document.addEventListener(
                type,
                (event) => {
                  if (window.probeEvents.length < 32) {
                    window.probeEvents.push({
                      type: event.type,
                      trusted: event.isTrusted,
                      focused: document.hasFocus(),
                      target: event.target.tagName,
                    });
                  }
                },
                true
              );
            }
          });
          const other = await page.context().newPage();
          await other.bringToFront();
          const before = await page.evaluate(() => document.hasFocus());
          const receipt = await handle.replyText(expected, textReplyBody);
          const observed = await page.evaluate(() => ({
            focused: document.hasFocus(),
            events: window.probeEvents,
            effects: window.textReplyState(),
          }));
          console.log(
            JSON.stringify({ activation, before, receipt, ...observed })
          );
        } finally {
          await handle.close();
        }
      }
    );
  }
} finally {
  await browser.close();
}
