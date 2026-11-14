import assert from 'node:assert/strict';
import {
  unreadInput,
  unreadPass,
  unreadReviewFixture,
  waitUnreadReview,
} from './question-unread-review-fixture.mjs';
import { noticeRows, noticeSnapshot } from './notice-policy-fixture.mjs';
import { noticeRule } from './notice-fixture.mjs';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { saveAnswerPolicy } from '../../js/src/automation/question-policy.js';

/** Finite borrowed visits; no nested watch or ordinary provider send is allowed. */
export const unreadNoticeFixture = async (options = {}) => {
  const env = await unreadReviewFixture(async (input, current) => {
    const pass = unreadPass();
    pass.conversations = [];
    for (const [index, body] of (options.bodies ?? [undefined]).entries()) {
      if (input.signal.aborted) {
        break;
      }
      const chat = String((options.firstChat ?? 8) + index);
      const rows = noticeRows(body);
      const snapshot = { ...noticeSnapshot(rows), chat, ...options.snapshot };
      const observation = {
        chat,
        question: snapshot,
        history: {
          rows,
          coverage: { complete: options.complete !== false },
          restored: options.restored !== false,
        },
      };
      const handle = {
        snapshot,
        async replyTextInactive(expected, text, verify) {
          await options.queued?.(current);
          await verify();
          assert.deepEqual(expected, snapshot);
          current.state.sends.push({ chat, text });
          return options.issue
            ? options.issue({ chat, text }, current)
            : {
                via: 'browser',
                source: 'hh',
                chat,
                text,
                messageId: `${chat}08`,
              };
        },
      };
      await input.onConversation?.(observation, handle);
      pass.conversations.push(observation);
      await options.afterVisit?.(current);
    }
    pass.coverage = {
      ...pass.coverage,
      observed: (options.bodies ?? [undefined]).length,
      visited: pass.conversations.length,
    };
    if (options.restoration) {
      pass.restoration = options.restoration;
    }
    return pass;
  });
  env.send.unreadNoticeReplySources = () => [{ id: 'hh', name: 'HeadHunter' }];
  env.send.openAnswerWatch = () =>
    assert.fail('A borrowed visit must not acquire another watch');
  await saveAnswerRule(env.store, noticeRule());
  if (options.notices) {
    await saveAnswerPolicy(env.store, { notices: options.notices });
  }
  env.input = unreadInput({ noticeReplies: true });
  return {
    ...env,
    async complete(input = env.input) {
      await env.browser.unreadStart(input);
      return waitUnreadReview(env.browser, input.id);
    },
  };
};
