import { createMemoryStore } from '../../js/src/storage/universal.js';
import { saveAnswerRule } from '../../js/src/automation/question-store.js';
import { createQuestionBrowser } from '../../js/src/automation/question-browser.js';

export const browserQuestion = () => ({
  chat: '7',
  question: {
    id: '101',
    body: 'Do you have distributed systems experience?',
    outgoing: false,
  },
  strictOptions: true,
  answerOptions: ['Yes', 'No'],
  hasDraft: false,
});
export const questionBrowserFixture = async (options = {}) => {
  const store = options.store ?? createMemoryStore();
  const state = {
    snapshot: browserQuestion(),
    reads: [],
    sends: [],
    prefills: [],
    now: new Date('2026-11-11T10:00:00Z'),
  };
  const send = Object.assign(
    async (draft) => {
      state.sends.push(draft);
      if (options.send) {
        return options.send(draft);
      }
      return {
        via: 'browser',
        source: draft.source,
        chat: draft.chat,
        option: draft.text,
        messageId: '102',
      };
    },
    {
      choiceSources: () => [{ id: 'hh', name: 'HeadHunter' }],
      readAnswerChoices: async (target) => {
        state.reads.push(target);
        return globalThis.structuredClone(state.snapshot);
      },
      prefillAnswer: async (input) => {
        state.prefills.push(input);
        return { prefilled: true };
      },
    }
  );
  await saveAnswerRule(store, {
    id: 'experience',
    question: state.snapshot.question.body,
    answers: [{ text: 'Yes', approved: true }],
  });
  const clock = () => state.now;
  return {
    store,
    state,
    send,
    clock,
    browser: createQuestionBrowser({ store, send, clock }),
  };
};
export const browserTarget = { source: 'hh', chat: 'https://hh.ru/chat/7' };

export const seedQuestionBrowserRead = (store) =>
  store.put({
    id: 'read:hh:7',
    tokens: ['read', 'hh', '7'],
    kind: 'read',
    source: 'hh',
    chat: '7',
    inboxMaxId: 100,
    unreadTopId: 101,
    unreadCount: 1,
  });

/** Match the disposable provider fixture with a visible, unread bot chat. */
export const seedQuestionBrowserChat = async ({ store, state }) => {
  await store.put({
    id: 'msg:hh:7:101',
    tokens: ['message', 'hh', '7'],
    source: 'hh',
    chat: '7',
    chatName: 'Employer bot fixture',
    chatType: 'bot',
    sender: 'recruiter',
    body: state.snapshot.question.body,
    timestamp: new Date().toISOString(),
  });
  await seedQuestionBrowserRead(store);
};
