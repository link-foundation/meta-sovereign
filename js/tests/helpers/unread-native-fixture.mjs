import { createMemoryStore } from '../../src/storage/universal.js';
import { createQuestionBrowser } from '../../src/automation/question-browser.js';
import { saveAnswerRule } from '../../src/automation/question-store.js';
import { withChatNavigationFixture } from './e2e-chat-navigation.mjs';

/** Borrow the real native visit and drain the service before releasing its page. */
export const withUnreadNativeFixture = (browser, html, work) =>
  withChatNavigationFixture(browser, { html }, async (fixture) => {
    const store = createMemoryStore();
    const service = createQuestionBrowser({
      store,
      send: Object.assign(
        (draft) => fixture.sender.send(draft),
        fixture.sender
      ),
    });
    try {
      await saveAnswerRule(store, {
        id: 'start-time',
        question: 'What time can you start?',
        answers: [{ text: 'At 9 a.m.', approved: true }],
      });
      return await work({ ...fixture, store, service });
    } finally {
      await service.close();
      await store.close?.();
    }
  });
