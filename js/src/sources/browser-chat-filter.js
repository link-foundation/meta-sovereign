/* global document, window */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { browserFrameVisible } from './browser-choice-document.js';
import { browserChatScrollRoot } from './browser-chat-list-state.js';

const chatFilterControl = (spec) => {
  const primary = [...document.querySelectorAll(spec.control)];
  const candidates = primary.length
    ? primary
    : [...document.querySelectorAll(spec.fallback)];
  return candidates.length === 1 ? candidates[0] : null;
};

const chatFilterStatus = (state, control, visible) => {
  const inactive =
    state.inactiveToken &&
    window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
  if (
    state.interrupted ||
    (state.inactiveToken &&
      (inactive?.token !== state.inactiveToken ||
        inactive.interrupted ||
        document.hasFocus()))
  ) {
    return 'owner-active';
  }
  if (
    control !== state.control ||
    !control?.isConnected ||
    control.disabled ||
    !state.root.isConnected ||
    !visible(state.root)
  ) {
    return 'changed';
  }
  return control.checked === state.expected ? 'ready' : 'filter-changed';
};

const activateChatFilter = (state, want) => {
  state.expected = want;
  if (state.control.checked !== want) {
    const inactive =
      state.inactiveToken &&
      window[Symbol.for('meta-sovereign.browser-inactive-view.v1')];
    state.activating = true;
    if (inactive && inactive.token === state.inactiveToken) {
      inactive.ownedFilterControl = state.control;
    }
    try {
      state.control.click();
    } finally {
      state.activating = false;
      if (inactive?.ownedFilterControl === state.control) {
        delete inactive.ownedFilterControl;
      }
    }
  }
};

const openChatFilter = (input, control, visible, scrollRoot) => {
  const cell = [...document.querySelectorAll(input.item)].find(visible);
  const root = cell && scrollRoot(cell);
  if (!control || control.disabled || !root || !visible(root)) {
    return null;
  }
  const state = {
    token: input.token,
    control,
    root,
    original: control.checked,
    expected: control.checked,
    top: root.scrollTop,
    inactiveToken: input.inactiveToken,
    interrupted: false,
  };
  state.events = [
    'pointerdown',
    'keydown',
    'wheel',
    'touchstart',
    'touchmove',
    'input',
    'change',
  ];
  state.mark = (event) => {
    if (
      state.activating &&
      event.target === control &&
      ['input', 'change'].includes(event.type)
    ) {
      return;
    }
    if (event.isTrusted || ['input', 'change'].includes(event.type)) {
      state.interrupted = true;
    }
  };
  for (const type of state.events) {
    document.addEventListener(type, state.mark, {
      capture: true,
      passive: true,
    });
  }
  return state;
};

const releaseChatFilter = (state, result, restore) => {
  result.restored = Boolean(
    restore &&
    result.state === 'ready' &&
    state.control.checked === state.original
  );
  if (result.restored) {
    state.root.scrollTop = state.top;
  }
  result.scrollRestored = result.restored && state.root.scrollTop === state.top;
  for (const type of state.events) {
    document.removeEventListener(type, state.mark, true);
  }
};

const filterState = (input, visible, scrollRoot) => {
  const key = Symbol.for('meta-sovereign.browser-chat-filter.v1');
  const { operation, token, spec, unreadOnly, restore } = input;
  const control = chatFilterControl(spec);
  if (operation === 'open' && !window[key]) {
    window[key] = openChatFilter(input, control, visible, scrollRoot);
  }
  const state = window[key];
  if (!state || state.token !== token) {
    return { state: state ? 'busy' : 'unavailable' };
  }
  let status = chatFilterStatus(state, control, visible);
  if (status === 'ready' && operation === 'set') {
    activateChatFilter(state, unreadOnly);
    status = chatFilterStatus(state, control, visible);
  }
  if (status === 'ready' && operation === 'restore' && restore) {
    activateChatFilter(state, state.original);
    status = chatFilterStatus(state, control, visible);
  }
  const result = {
    state: status,
    before: state.original,
    observed: control?.checked,
  };
  if (operation === 'release') {
    releaseChatFilter(state, result, restore);
    delete window[key];
  }
  return result;
};

// Only static application functions enter the source; all selectors remain data.
export const browserChatFilterState = new Function(`return (input) => {
  const visible = (${browserFrameVisible.toString()});
  const scrollRoot = (${browserChatScrollRoot.toString()});
  const chatFilterControl = (${chatFilterControl.toString()});
  const chatFilterStatus = (${chatFilterStatus.toString()});
  const activateChatFilter = (${activateChatFilter.toString()});
  const openChatFilter = (${openChatFilter.toString()});
  const releaseChatFilter = (${releaseChatFilter.toString()});
  return (${filterState.toString()})(input, visible, scrollRoot);
}`)();

const failure = (state) =>
  Object.assign(new Error('The provider chat filter could not be verified'), {
    code: `browser-chat-filter-${state}`,
    scanReason: state,
    fallback: false,
  });

const restoreChatFilter = async (control, options, pause) => {
  let restore;
  try {
    await options.verifyCurrent?.();
    restore = (await control('status')).state === 'ready';
    if (restore) {
      await control('restore', { restore });
      await pause(options.waitMs);
      await options.verifyCurrent?.();
    }
  } catch {
    restore = false;
  }
  try {
    return await control('release', { restore });
  } catch {
    return null;
  }
};

/** Select and restore a native list filter without taking focus or setting checked. */
export const withBrowserChatFilter = async (
  document,
  ui,
  options,
  read,
  pause = sleep
) => {
  const token = randomUUID();
  const control = (operation, extra = {}) =>
    document.evaluate({
      fn: browserChatFilterState,
      args: [
        {
          token,
          operation,
          spec: ui.chatScan.unreadFilter,
          item: ui.chats.item,
          unreadOnly: options.unreadOnly,
          inactiveToken: options.inactiveToken,
          ...extra,
        },
      ],
    });
  const ready = async (operation) => {
    const result = await control(operation);
    if (result.state !== 'ready') {
      throw failure(result.state);
    }
    return result;
  };
  let result;
  let receipt;
  let selected;
  try {
    await ready('open');
    if (options.signal?.aborted) {
      throw failure('cancelled');
    }
    await options.verifyCurrent?.();
    selected = await ready('set');
    await pause(options.waitMs);
    await ready('status');
    result = await read(() => ready('status'));
  } finally {
    receipt = await restoreChatFilter(control, options, pause);
  }
  const filter = {
    requested: options.unreadOnly,
    before: selected.before,
    observed: selected.observed,
    restored: receipt?.restored === true,
    scrollRestored: receipt?.scrollRestored === true,
  };
  if (process.env.MS_BROWSER_CHAT_SCAN_DEBUG === '1') {
    console.error('[browser-chat-filter]', filter);
  }
  return {
    ...result,
    filter,
    restored: Boolean(
      result.restored && filter.restored && filter.scrollRestored
    ),
  };
};
