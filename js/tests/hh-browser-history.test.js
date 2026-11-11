import test from 'node:test';
import assert from 'node:assert/strict';
import { browserChoicePage } from '../src/sources/browser-choices.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';

/** Only DOM primitives used by the real serialized reader; no browser process. */
const withHistory = (records, work) => {
  const previous = new Map();
  const rows = records.map((record, index) => ({
    isConnected: !record.detached,
    getClientRects: () => (record.hidden ? [] : [{}]),
    getAttribute: (name) =>
      name === 'data-qa'
        ? `chatik-chat-message-${index + 1}`
        : name === 'data-time'
          ? `2026-11-11T10:00:0${index}Z`
          : null,
    matches: () => false,
    querySelector: (selector) => {
      if (selector === HH_WEB_UI.messages.body) {
        return { innerText: record.body ?? '' };
      }
      if (selector === HH_WEB_UI.messages.serviceTitle) {
        return { textContent: record.title ?? '' };
      }
      return selector === HH_WEB_UI.messages.outgoing && record.outgoing
        ? {}
        : null;
    },
  }));
  const globals = {
    document: {
      querySelectorAll: (selector) =>
        selector === HH_WEB_UI.messages.item ? rows : [],
    },
    location: { href: 'https://hh.ru/chat/7' },
    window: {},
    getComputedStyle: () => ({ opacity: '1' }),
  };
  for (const [key, value] of Object.entries(globals)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  try {
    return work((operation) =>
      browserChoicePage({ spec: HH_WEB_UI, operation })
    );
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }
  }
};

test('HH application titles become chronology barriers even without text or delivery icons', () => {
  const titles = [
    'Отклик на вакансию',
    ' Vacancy   application ',
    'Application for the vacancy',
    'Response to a vacancy',
    'Bewerbung',
  ];
  withHistory(
    titles.map((title) => ({ title })),
    (read) => {
      const history = read('history');
      assert.equal(history.chat, '7');
      assert.equal(history.messages.length, titles.length);
      assert.ok(history.messages.every((row) => row.service === true));
      assert.equal(read('read').code, 'answer-question-unavailable');
    }
  );
});

test('employer and recruiter-bot questions mentioning applications stay actionable', () => {
  withHistory(
    [
      { title: 'Recruiter bot', body: 'When did you submit your application?' },
      {
        title: 'Recruiter',
        body: 'Vacancy application: can you start Monday?',
      },
    ],
    (read) => {
      const value = read('read');
      assert.equal(value.question.id, '2');
      assert.equal(value.question.outgoing, false);
      assert.ok(value.messages.every((row) => !row.service));
    }
  );
});

test('hidden application duplicates never become history barriers', () => {
  withHistory(
    [
      { title: 'Vacancy application', hidden: true },
      { title: 'Vacancy application', detached: true },
      { body: 'Can you start Monday?' },
    ],
    (read) => {
      assert.deepEqual(
        read('history').messages.map((row) => row.id),
        ['3']
      );
    }
  );
});

test('a blank verified HH chat remains readable without inventing a question', () => {
  withHistory([], (read) => {
    assert.deepEqual(read('history'), { chat: '7', messages: [] });
    assert.equal(read('read').code, 'answer-question-unavailable');
  });
});
