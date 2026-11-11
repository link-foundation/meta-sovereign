/* global document, window, getComputedStyle */
import { browserFrameVisible } from './browser-choice-document.js';

const scrollOwnerActive = (state) =>
  state.interrupted ||
  (state.inactiveToken &&
    (window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]?.token !==
      state.inactiveToken ||
      window[Symbol.for('meta-sovereign.browser-inactive-view.v1')]
        .interrupted ||
      document.hasFocus())) ||
  (state.drafts ?? []).some(
    ([node, value]) => !node.isConnected || node.value !== value
  ) ||
  (state.composer &&
    document.querySelectorAll(state.composer).length !== state.drafts.length);

const restoreScroll = (state, { restore, history, item, idAttribute }) => {
  if (!restore || scrollOwnerActive(state) || !state.visible(state.root)) {
    return false;
  }
  if (!history) {
    state.root.scrollTop = state.original;
    return true;
  }
  const anchor = [...state.root.querySelectorAll(item)].find(
    (node) => node.getAttribute(idAttribute) === state.anchor?.id
  );
  if (anchor) {
    state.root.scrollTop +=
      anchor.getBoundingClientRect().top -
      state.root.getBoundingClientRect().top -
      state.anchor.offset;
    state.restoring = true;
    return true;
  }
  if (!state.restoring) {
    state.root.scrollTop =
      state.original +
      (state.reversed ? 0 : state.root.scrollHeight - state.originalHeight);
    state.restoring = true;
  }
  return false;
};

const historyAnchor = (root, cells, idAttribute) => {
  const bounds = root.getBoundingClientRect();
  const anchor = cells.find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  return (
    anchor && {
      id: anchor.getAttribute(idAttribute),
      offset: anchor.getBoundingClientRect().top - bounds.top,
    }
  );
};

const scrollRoot = (cell) => {
  let root = cell?.parentElement;
  while (root && !/^(?:auto|scroll)$/.test(getComputedStyle(root).overflowY)) {
    root = root.parentElement;
  }
  return root ?? document.scrollingElement;
};

const openScroll = (
  { token, item, composer, idAttribute, scope, inactiveToken },
  visible
) => {
  const history = scope === 'history';
  const cell = [...document.querySelectorAll(item)].find(visible);
  const root = scrollRoot(cell);
  if (!root || !cell) {
    return { refused: 'unavailable' };
  }
  const cells = history
    ? [...document.querySelectorAll(item)].filter(visible)
    : [];
  if (
    history &&
    (cells.length > 500 || cells.some((node) => !root.contains(node)))
  ) {
    return { refused: 'unavailable' };
  }
  const state = {
    token,
    inactiveToken,
    root,
    visible,
    original: root.scrollTop,
    originalHeight: root.scrollHeight,
    anchor: history ? historyAnchor(root, cells, idAttribute) : undefined,
    reversed: getComputedStyle(root).flexDirection === 'column-reverse',
    composer,
    interrupted: false,
    drafts: composer
      ? [...document.querySelectorAll(composer)].map((node) => [
          node,
          node.value,
        ])
      : [],
  };
  state.events = [
    'pointerdown',
    'keydown',
    'wheel',
    'touchstart',
    'touchmove',
    'input',
  ];
  state.mark = (event) => {
    if (event.isTrusted || history) {
      state.interrupted = true;
    }
  };
  for (const type of state.events) {
    document.addEventListener(type, state.mark, {
      capture: true,
      passive: true,
    });
  }
  state.scroll = (event) => {
    if (
      event.target === root ||
      (root === document.scrollingElement && event.target === document)
    ) {
      state.pendingScroll = false;
    }
  };
  document.addEventListener('scroll', state.scroll, {
    capture: true,
    passive: true,
  });
  const previous = root.scrollTop;
  root.scrollTop = history && !state.reversed ? root.scrollHeight : 0;
  state.pendingScroll = previous !== root.scrollTop;
  return state;
};

/** Page-side scroll ownership; real owner input always wins over restoration. */
const browserScrollState = (
  input,
  visible,
  openScroll,
  restoreScroll,
  scrollOwnerActive
) => {
  const {
    operation,
    token,
    item,
    top,
    restore,
    scope = 'list',
    idAttribute,
  } = input;
  const history = scope === 'history';
  const key = Symbol.for(
    history
      ? 'meta-sovereign.browser-conversation-history.v1'
      : 'meta-sovereign.browser-chat-list.v1'
  );
  const release = (state) => {
    document.removeEventListener('scroll', state.scroll, true);
    for (const type of state.events) {
      document.removeEventListener(type, state.mark, true);
    }
    const restored = restoreScroll(state, {
      restore,
      history,
      item,
      idAttribute,
    });
    delete window[key];
    return { state: 'released', restored };
  };
  const read = (state) => {
    if (scrollOwnerActive(state)) {
      return { state: 'owner-active' };
    }
    if (!visible(state.root)) {
      return { state: 'changed' };
    }
    if (operation === 'move') {
      const previous = state.root.scrollTop;
      state.root.scrollTop = top;
      state.pendingScroll = previous !== state.root.scrollTop;
    }
    const { scrollTop, scrollHeight, clientHeight } = state.root;
    if (clientHeight <= 0 || !Number.isFinite(scrollHeight)) {
      return { state: 'unavailable' };
    }
    return {
      state: 'ready',
      top: scrollTop,
      height: scrollHeight,
      view: clientHeight,
      bottom: scrollTop + clientHeight >= scrollHeight - 2,
      loading: Boolean(
        state.pendingScroll ||
        state.root.querySelector('[aria-busy="true"], [role="progressbar"]')
      ),
      ...(history
        ? {
            reversed: state.reversed,
            oldest: state.reversed
              ? scrollTop <= -(scrollHeight - clientHeight) + 2
              : scrollTop <= 2,
          }
        : {}),
    };
  };
  if (operation === 'open') {
    if (window[key]) {
      return { state: 'busy' };
    }
    if (scrollOwnerActive({ inactiveToken: input.inactiveToken })) {
      return { state: 'owner-active' };
    }
    const state = openScroll(input, visible);
    if (state.refused) {
      return { state: state.refused };
    }
    window[key] = state;
  }
  const state = window[key];
  if (!state || state.token !== token) {
    return { state: 'unavailable' };
  }
  if (operation === 'restore') {
    restoreScroll(state, { restore, history, item, idAttribute });
  }
  return operation === 'release' ? release(state) : read(state);
};

// Static application functions only; selectors and provider values remain data.
export const browserChatListState = new Function(`return (input) => {
  const visible = (${browserFrameVisible.toString()});
  const scrollOwnerActive = (${scrollOwnerActive.toString()});
  const restoreScroll = (${restoreScroll.toString()});
  const historyAnchor = (${historyAnchor.toString()});
  const scrollRoot = (${scrollRoot.toString()});
  const openScroll = (${openScroll.toString()});
  return (${browserScrollState.toString()})(input, visible, openScroll, restoreScroll, scrollOwnerActive);
}`)();
