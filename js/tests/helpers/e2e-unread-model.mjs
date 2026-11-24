import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createMemoryStore } from '../../src/storage/universal.js';
import { createQuestionBrowser } from '../../src/automation/question-browser.js';
import { unreadInput } from '../../../experiments/issue-56/question-unread-review-fixture.mjs';
import {
  modelQuestion,
  modelText,
  modelRunnerFixture,
  seedModelAnswers,
} from '../../../experiments/issue-56/forms-model-fixture.mjs';
import { chatNavigationHtml } from '../../../experiments/issue-56/chat-navigation-fixture.mjs';
import {
  withChatNavigationFixture,
  readChatNavigationView,
} from './e2e-chat-navigation.mjs';
import { questionBrowserUi } from './question-browser-ui.mjs';
import { waitUnreadReview as settle } from './e2e-unread-answers.mjs';
import {
  openUnread,
  verifyUnreadFocusRefusal,
} from './e2e-question-unread-controls.mjs';

/** Real native editor, synthetic provider and injected model; no live account. */
export const verifyUnreadModel = async (
  browser,
  { screenshots, before = false } = {}
) => {
  const calls = [];
  await withChatNavigationFixture(
    browser,
    {
      html: chatNavigationHtml({
        textReplies: true,
        precedingOutgoing: true,
        latestMessages: { 8: modelQuestion },
      }),
    },
    async ({ sender, page }) => {
      const store = createMemoryStore();
      await seedModelAnswers(store);
      const service = createQuestionBrowser({
        store,
        send: Object.assign((draft) => sender.send(draft), sender),
        runner: modelRunnerFixture(calls),
      });
      try {
        const input = unreadInput({
          answerChats: true,
          modelDraft: true,
          approximate: false,
          maxChats: 2,
          waitMs: 100,
          endWaitMs: 100,
          budgetMs: 30000,
        });
        await service.unreadStart(input);
        const result = await settle(service, input.id);
        if (browser.browserType().name() !== 'chromium') {
          assert.equal(result.code, 'browser-background-focus-unavailable');
          return;
        }
        assert.equal(result.state, 'completed', JSON.stringify(result));
        const view = await readChatNavigationView(page);
        assert.equal(result.restoration.heldReview.chat, '8');
        assert.equal(
          result.entries[0].answer.phase,
          before ? 'review' : 'prefilled'
        );
        assert.equal(calls.length, before ? 0 : 1);
        assert.equal(view.draft, before ? '' : modelText);
        assert.equal(view.sends, 0);
        assert.equal(await page.evaluate(() => window.fixture.unread['9']), 1);
        if (screenshots) {
          await mkdir(screenshots, { recursive: true });
          await page.locator('#result').evaluate((node, receipt) => {
            node.textContent = JSON.stringify(receipt, null, 2);
          }, result);
          await page.screenshot({
            path: join(
              screenshots,
              before ? 'unread-model-before.png' : 'unread-model-after.png'
            ),
            fullPage: true,
          });
        }
        const held = { ...input, id: unreadInput().id, heldChat: '8' };
        await service.unreadStart(held);
        await settle(service, held.id);
        assert.equal(calls.length, before ? 0 : 1);
        assert.equal(
          (await readChatNavigationView(page)).draft,
          before ? '' : modelText
        );
      } finally {
        await service.close();
        await store.close?.();
      }
    }
  );
  return { cases: 1, modelCalls: calls.length, before, liveProvider: false };
};

export const verifyUnreadModelControls = async (
  browser,
  { screenshots } = {}
) => {
  const scenario = await questionBrowserUi(browser, {
    screenshots,
    group: 'question-unread-model',
    serverOptions: {
      unreadReview: true,
      unreadAnswers: true,
      unreadModel: true,
    },
  });
  try {
    await scenario.open();
    const unread = await openUnread(scenario.controls);
    assert.equal(await unread.locator('[data-model-draft-opt-in]').count(), 0);
    await unread.locator('[data-browser-unread-answers]').check();
    const model = unread.locator('[data-model-draft-opt-in]');
    assert.equal(await model.isChecked(), false);
    await model.check();
    if (browser.browserType().name() !== 'chromium') {
      await verifyUnreadFocusRefusal(unread, scenario.fixture);
      return { cases: 1, liveProvider: false };
    }
    await unread.locator('[data-browser-unread-confirm]').check();
    await unread.locator('[data-browser-unread-start]').click();
    await unread.locator('[data-browser-unread-result="completed"]').waitFor();
    await unread.locator('[data-browser-unread-answer="prefilled"]').waitFor();
    assert.equal((await scenario.fixture.stats()).sends, 0);
    assert.equal(
      await scenario.fixture.page.locator('textarea').inputValue(),
      modelText
    );
    await unread.scrollIntoViewIfNeeded();
    await scenario.shot('unread-model-controls');
    assert.deepEqual(scenario.errors, []);
    return { cases: 1, liveProvider: false };
  } finally {
    await scenario.close();
  }
};
