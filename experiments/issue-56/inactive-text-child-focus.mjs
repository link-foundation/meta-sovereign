import assert from 'node:assert/strict';
import { questionBrowserProbe } from './question-browser-probe.mjs';
import { withHhBrowserScanFixture } from '../../js/tests/helpers/e2e-hh-chat-scan.mjs';
import { textReplyHtml, textReplyBody } from './text-reply-fixture.mjs';

await questionBrowserProbe({}, async (browser) => {
  await withHhBrowserScanFixture(
    browser,
    {
      html: textReplyHtml,
      frames: [{ url: 'https://chatik.hh.ru/chat/7' }],
      choiceReceiptMs: 100,
    },
    async ({ sender, page }) => {
      const handle = await sender.openAnswerWatch({ source: 'hh', chat: '7' });
      try {
        const expected = await handle.read();
        const other = await page.context().newPage();
        await other.bringToFront();
        const frame = page.frames().find((value) => value !== page.mainFrame());
        const observe = () =>
          frame.evaluate(() => ({
            focused: document.hasFocus(),
            visibility: document.visibilityState,
            sends: window.textReplyState().sends,
          }));
        console.log('Before', JSON.stringify(await observe()));
        const locator = frame.locator.bind(frame);
        frame.locator = (selector, options) => {
          const result = locator(selector, options);
          if (selector.startsWith('[data-meta-answer-choice=')) {
            const evaluate = result.evaluate.bind(result);
            result.evaluate = async (...args) => {
              await page.bringToFront();
              console.log('Returned', JSON.stringify(await observe()));
              return evaluate(...args);
            };
          }
          return result;
        };
        const result = await handle
          .replyTextInactive(expected, textReplyBody)
          .then(
            (value) => ({ sent: value }),
            (error) => ({ code: error.code })
          );
        console.log(JSON.stringify({ result, after: await observe() }));
        assert.equal((await observe()).sends, 0);
      } finally {
        await handle.close();
      }
    }
  );
});
