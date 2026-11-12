import vm from 'node:vm';
import { browserChatReplyView } from '../../js/src/sources/browser-chat-reply-view.js';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';

export const confirmedReply = {
  via: 'browser',
  source: 'hh',
  chat: '7',
  text: 'Confirmed exact reply',
  messageId: '708',
};

/** Small page boundary for exact identity, draft, ownership and geometry checks. */
export const replyViewFixture = (options = {}) => {
  const reply = { ...confirmedReply };
  let visible = false;
  let scrolls = 0;
  const rect = (top) => ({
    top,
    bottom: top + 80,
    left: 10,
    right: 510,
    width: 500,
    height: 80,
  });
  const base = {
    isConnected: true,
    getClientRects: () => [rect(100)],
    getAttribute: () => null,
  };
  const field = { ...base, value: options.draft ?? '' };
  const root = {
    ...base,
    parentElement: null,
    contains: (node) => node === bubble,
    getBoundingClientRect: () => ({ ...rect(100), bottom: 400 }),
  };
  const bubble = {
    ...base,
    parentElement: root,
    getAttribute: (name) =>
      name === HH_WEB_UI.messages.idAttribute
        ? 'chatik-chat-message-708'
        : null,
    matches: () => options.outgoing !== false,
    querySelector: (selector) =>
      selector === HH_WEB_UI.messages.body
        ? { innerText: options.body ?? reply.text }
        : null,
    getBoundingClientRect: () => rect(visible ? 200 : 900),
    scrollIntoView() {
      visible = true;
      scrolls++;
    },
  };
  const state = {
    token: 'view',
    url: 'https://hh.ru/chat/7',
    draft: { value: options.originalDraft ?? '' },
  };
  const window = {
    innerHeight: 800,
    innerWidth: 1000,
    location: { href: options.url ?? state.url },
    [Symbol.for('meta-sovereign.browser-chat-view.v1')]: state,
    [Symbol.for('meta-sovereign.browser-inactive-view.v1')]: {
      token: 'inactive',
      interrupted: options.interrupted,
    },
  };
  const context = vm.createContext({
    window,
    document: {
      hasFocus: () => options.focused === true,
      querySelectorAll: (selector) =>
        selector === HH_WEB_UI.composer
          ? [field]
          : options.duplicate
            ? [bubble, bubble]
            : [bubble],
    },
    getComputedStyle: () => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      overflowY: 'auto',
    }),
  });
  return {
    state,
    scrolls: () => scrolls,
    run(operation) {
      context.input = {
        operation,
        token: 'view',
        inactiveToken: 'inactive',
        ui: HH_WEB_UI,
        reply,
      };
      return vm.runInContext(
        `(${browserChatReplyView.toString()})(input)`,
        context
      ).state;
    },
  };
};
