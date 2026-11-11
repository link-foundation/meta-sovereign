import { browserChoicePage } from '../../js/src/sources/browser-choices.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';

/** Only DOM primitives used by the real serialized reader; no browser process. */
export const withHistory = (records, work) => {
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
