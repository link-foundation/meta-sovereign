import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { ApplicationChats } from '../../js/src/jobs/application-chats.js';
import { applicationBatchFixture } from './application-batch-fixture.mjs';

export const untilApplicationChats = async (read, predicate) => {
  for (let n = 0; n < 500; n++) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    await delay(10);
  }
  assert.fail(
    'Application chat worker did not reach the expected bounded state.'
  );
};

/** Actual child, synthetic sender/reviewer: no account, browser or model invocation. */
export const applicationChatsFixture = (
  t,
  { prepare, closing, chatError } = {}
) => {
  const calls = {
    children: [],
    preparation: [],
    start: [],
    logs: [],
    close: 0,
    questionClose: 0,
  };
  const held = {
    chat: 'chat-8',
    questionId: 'q-1',
    currentQuestionId: 'q-1',
    hasDraft: true,
    title: 'Synthetic employer · Python engineer',
    url: 'https://hh.ru/chat?chat_id=8',
  };
  const f = applicationBatchFixture(t, {
    application: {
      createChats: () => {
        const worker = new ApplicationChats({
          store: f.store,
          log: (entry) => calls.logs.push(entry),
          sender: (options) => ({
            send: async () => assert.fail('This lifecycle probe cannot send'),
            prepareUnreadConversations: async (input) => {
              calls.preparation.push({ options, input });
              await prepare?.();
              if (chatError) {
                throw Object.assign(new Error(chatError), { code: chatError });
              }
            },
            close: async () => {
              await closing?.();
              calls.close++;
            },
          }),
          questions: ({ store }) => {
            assert.equal(
              store,
              f.store,
              'the canonical store belongs to the parent'
            );
            return {
              unreadStart: async (input) => {
                calls.start.push(input);
              },
              unreadStatus: async () => ({
                state: 'active',
                owned: true,
                restoration: { heldReview: held },
              }),
              close: async () => {
                calls.questionClose++;
              },
            };
          },
        });
        calls.children.push(worker);
        return worker;
      },
    },
  });
  const worker = () => calls.children[0];
  const ready = () =>
    untilApplicationChats(
      f.status,
      (row) =>
        row.batch?.chatWorker?.phase === 'running' && row.batch.chatWorker.held
    );
  return { ...f, calls, worker, ready, held };
};
