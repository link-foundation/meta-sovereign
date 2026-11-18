import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createMemoryStore } from '../../js/src/storage/universal.js';
import { createQuestionBrowser } from '../../js/src/automation/question-browser.js';
import { newBrowserWatchId } from '../../js/src/automation/question-browser-watch.js';
import { saveAnswerPolicy } from '../../js/src/automation/question-policy.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { browserPendingTurn } from '../../js/src/sources/browser-pending-turn.js';
import { noticeText, noticeRule } from './notice-fixture.mjs';

export const rejectionText = 'We cannot invite you for an interview.';
export const noticeSnapshot = (rows) => ({
  chat: '7',
  question: { ...rows.at(-1), outgoing: Boolean(rows.at(-1).outgoing) },
  strictOptions: false,
  answerOptions: [],
  hasDraft: false,
  pendingTurn: browserPendingTurn(rows),
  noticeContext: {
    company: 'Fixture employer',
    vacancy: 'Engineer',
    vacancyUrl: 'https://hh.ru/vacancy/123',
    canReply: true,
  },
});
export const noticeRows = (body = noticeText) => [
  { id: '1', body: '', service: true, outgoing: false },
  { id: '101', body, outgoing: false },
];

/** Finite current-chat provider; every issue hook runs after the final admission. */
export const noticePolicyFixture = async (options = {}) => {
  const store = options.store ?? createMemoryStore();
  const state = {
    rows: noticeRows(options.body),
    sends: [],
    opens: 0,
    closes: 0,
    active: false,
    histories: 0,
    now: new Date('2026-11-11T10:00:00Z'),
  };
  state.snapshot = noticeSnapshot(state.rows);
  const sources = () => [{ id: 'hh', name: 'HeadHunter' }];
  const read = async () => globalThis.structuredClone(state.snapshot);
  const send = Object.assign(
    () => assert.fail('Notice sends use only the owned inactive handle'),
    {
      choiceSources: sources,
      textReplySources: sources,
      answerWatchSources: sources,
      noticeReplySources: sources,
      readAnswerChoices: read,
      prefillAnswer: () =>
        assert.fail('Notice mode never prefills the foreground'),
      openAnswerWatch: async () => {
        state.opens++;
        return {
          read,
          async readInactiveQuestion() {
            await options.reading?.(state);
            if (state.active) {
              throw Object.assign(new Error('Owner active'), {
                code: 'browser-background-owner-active',
              });
            }
            return read();
          },
          async readInactiveHistory(input) {
            state.histories++;
            await options.history?.(input, state);
            await input.verifyCurrent();
            return globalThis.structuredClone({
              rows: state.rows,
              coverage: {
                complete: options.complete !== false,
                scope: 'conversation',
              },
              restored: options.restored !== false,
            });
          },
          async replyTextInactive(snapshot, text, verify) {
            await options.queued?.(state);
            await verify();
            assert.deepEqual(snapshot, state.snapshot);
            state.sends.push(text);
            if (options.issue) {
              return options.issue(text, state);
            }
            return {
              via: 'browser',
              source: 'hh',
              chat: '7',
              text,
              messageId: '102',
            };
          },
          async close() {
            state.closes++;
          },
        };
      },
    }
  );
  await saveAnswerRule(store, noticeRule());
  if (options.notices) {
    await saveAnswerPolicy(store, { notices: options.notices });
  }
  const env = { store, send, state, clock: () => state.now };
  const browser = createQuestionBrowser({ ...env, watchIntervalMs: 3 });
  const target = { source: 'hh', chat: 'https://hh.ru/chat/7' };
  const review = await browser.inspect(target);
  const input = {
    id: newBrowserWatchId(),
    review: review.id,
    confirm: true,
    noticeReplies: true,
  };
  const until = async (predicate) => {
    for (let tries = 0; tries < 250; tries++) {
      const result = await browser.watchStatus(input);
      if (predicate(result)) {
        return result;
      }
      await delay(4);
    }
    assert.fail('Finite notice watcher condition was not reached');
  };
  return { ...env, browser, review, input, until };
};

export const checkNoticeWatch = async (options, check) => {
  const env = await noticePolicyFixture(options);
  try {
    await check(env);
  } finally {
    await env.browser.close();
  }
};
