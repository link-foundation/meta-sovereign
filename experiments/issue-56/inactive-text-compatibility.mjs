import assert from 'node:assert/strict';
import { questionBrowserProbe } from './question-browser-probe.mjs';
import { verifyInactiveHistory } from '../../js/tests/helpers/e2e-inactive-history.mjs';
import { withHhBrowserScanFixture } from '../../js/tests/helpers/e2e-hh-chat-scan.mjs';
import { providerChoiceDraft } from './provider-choice-fixture.mjs';
import { textReplyHtml, textReplyBody } from './text-reply-fixture.mjs';

await questionBrowserProbe({}, async (browser) => {
  const history = await verifyInactiveHistory(browser);
  console.log(JSON.stringify({ history }));
  const explicit = [];
  for (const choice of [false, true]) {
    await withHhBrowserScanFixture(
      browser,
      { html: textReplyHtml },
      async ({ sender, page }) => {
        const target = { source: 'hh', chat: '7' };
        await sender.readAnswerChoices(target);
        if (choice) {
          await page.evaluate(() => window.mountChoices());
        }
        const expected = await sender.readAnswerChoices(target);
        const receipt = choice
          ? await sender.chooseAnswer(providerChoiceDraft())
          : await sender.replyText({
              ...target,
              expected,
              text: textReplyBody,
            });
        assert.equal(receipt.messageId, '102');
        const state = await page.evaluate(() => window.textReplyState());
        assert.equal(state.choices, choice ? 1 : 0);
        assert.equal(state.sends, choice ? 0 : 1);
        assert.equal(state.hooks, 0);
        assert.equal(state.draft, '');
        explicit.push(choice ? 'ordinary-choice' : 'ordinary-text');
      }
    );
  }
  return { history, explicit, liveProvider: false };
});
