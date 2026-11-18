import { runInNewContext } from 'node:vm';
import {
  createBrowserSender,
  WEB_UIS,
} from '../../js/src/sources/browser-sender.js';

/** Exercise the real page reader with a finite DOM and native command effects. */
export const browserComposerFixture = ({
  source = 'vk',
  input = 'type',
  initial = '',
  changeAt,
  changed = 'Owner replacement',
  unreadable = false,
} = {}) => {
  const ui = WEB_UIS[source];
  const state = {
    value: initial,
    effects: [],
    inputs: [],
    navigations: [],
    closed: 0,
  };
  const node = {
    get value() {
      return state.value;
    },
    getClientRects: () => [1],
    matches: () => false,
    closest: () => null,
  };
  let current = node;
  const window = { location: { href: 'about:blank' } };
  const context = {
    window,
    document: { querySelectorAll: () => [current] },
    getComputedStyle: () => ({ visibility: 'visible' }),
  };
  const change = (stage) => {
    if (changeAt === stage) {
      state.value = changed;
    }
    if (changeAt === `${stage}-node`) {
      current = { ...node };
    }
  };
  const first = (selector) => selector.split(',')[0].trim();
  const commander = {
    goto: async ({ url }) => {
      state.navigations.push(url);
      window.location.href = url;
      const prefill = new URL(url).searchParams.get('text');
      if (prefill) {
        state.value = prefill;
      }
    },
    count: async ({ selector }) => {
      if (selector === first(ui.send.selector)) {
        change('button');
      }
      return 1;
    },
    clickButton: async ({ selector }) => {
      if (selector === first(ui.composer)) {
        change('focus');
      } else {
        state.effects.push(state.value);
      }
    },
    typeText: async ({ text }) => {
      state.inputs.push(text);
      state.value += text;
      change('input');
    },
    fillTextArea: async ({ text, checkEmpty }) => {
      change('fill');
      if (checkEmpty && state.value) {
        return { skipped: true };
      }
      state.inputs.push(text);
      state.value = text;
      change('input');
      return { filled: true };
    },
    pressKey: async ({ key }) => {
      if (key === 'Shift+Enter') {
        state.value += '\n';
      } else {
        state.effects.push(state.value);
      }
    },
    evaluate: async ({ fn, args: [argument] }) => {
      if (unreadable) {
        return undefined;
      }
      return runInNewContext(`(${fn.toString()})(input)`, {
        ...context,
        input: argument,
      });
    },
  };
  const sender = createBrowserSender({
    input,
    loginTimeoutMs: 0,
    pollMs: 0,
    openSession: async () => ({
      commander,
      close: () => {
        state.closed++;
      },
    }),
  });
  return {
    state,
    sender,
    draft: { source, chat: '201', to: '+12025550123', text: 'Reviewed\nreply' },
  };
};
