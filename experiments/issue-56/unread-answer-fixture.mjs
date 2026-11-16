import assert from 'node:assert/strict';
import {
  unreadInput,
  unreadPass,
  unreadReviewFixture,
  waitUnreadReview,
} from './question-unread-review-fixture.mjs';
import { browserQuestion } from './question-browser-fixture.mjs';

/** Sequential bounded mock: text sends and nested watches are forbidden. */
export const unreadAnswerFixture = async (options = {}) => {
  const rows = options.rows ?? [{}, { strictOptions: false }, {}];
  const env = await unreadReviewFixture(async (input, current) => {
    const pass = unreadPass();
    pass.conversations = [];
    for (const [index, row] of rows.entries()) {
      if (input.signal.aborted) {
        break;
      }
      const snapshot = {
        ...browserQuestion(),
        chat: String(8 + index),
        ...row,
        ...(row.strictOptions === false ? { answerOptions: [] } : {}),
      };
      if (row.noticeContext) {
        snapshot.noticeContext = {
          company: 'Example employer',
          vacancy: 'Example vacancy',
          vacancyUrl: 'https://hh.ru/vacancy/123',
          ...row.noticeContext,
        };
      }
      if (input.heldChat && input.heldChat !== snapshot.chat) {
        continue;
      }
      const observation = { chat: snapshot.chat, question: snapshot };
      if (options.history) {
        await input.onHistoryWindow?.({
          chat: snapshot.chat,
          rows: options.history(snapshot),
        });
      }
      let held = false;
      const value = await input.onConversation?.(observation, {
        snapshot,
        async holdReviewInactive() {
          held = true;
        },
        async prefillInactive(expected, text, verify) {
          await options.queued?.(current, input, snapshot);
          await verify();
          assert.deepEqual(expected, snapshot);
          current.state.prefills.push({ chat: snapshot.chat, text });
          return { prefilled: true };
        },
        async selectInactive(draft, verify) {
          await options.queued?.(current, input, snapshot);
          await verify();
          current.state.sends.push(draft);
          return options.issue
            ? options.issue(draft, current)
            : {
                via: 'browser',
                source: 'hh',
                chat: snapshot.chat,
                option: draft.text,
                messageId: `${snapshot.chat}08`,
              };
        },
        replyTextInactive() {
          assert.fail('Ordinary unread text must never send');
        },
      });
      pass.conversations.push(observation);
      if (held) {
        pass.restoration = {
          restored: false,
          reason: 'review-held',
          heldReview: {
            chat: snapshot.chat,
            questionId: snapshot.question.id,
            currentQuestionId: snapshot.question.id,
            hasDraft: snapshot.hasDraft || value?.holdReview === true,
          },
        };
      }
      await options.afterVisit?.(current);
      if (value?.holdReview) {
        break;
      }
    }
    pass.coverage = {
      ...pass.coverage,
      reason: pass.restoration.heldReview ? 'review-held' : 'observed-list',
      observed: rows.length,
      visited: pass.conversations.length,
    };
    return pass;
  }, options);
  env.send.unreadAnswerReplySources = () => [{ id: 'hh', name: 'HeadHunter' }];
  env.send.openAnswerWatch = () =>
    assert.fail('A borrowed visit cannot open another watch');
  env.input = unreadInput({ answerChats: true, maxChats: 4 });
  return {
    ...env,
    async complete(input = env.input) {
      await env.browser.unreadStart(input);
      return waitUnreadReview(env.browser, input.id);
    },
  };
};
