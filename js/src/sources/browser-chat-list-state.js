/* global document, window, getComputedStyle */

/** Page-side scroll ownership; real owner input always wins over restoration. */
export const browserChatListState = ({
  operation,
  token,
  item,
  top,
  restore,
}) => {
  const key = Symbol.for('meta-sovereign.browser-chat-list.v1');
  const visible = (node) => {
    if (!node.getClientRects().length) {
      return false;
    }
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (
        parent.hidden ||
        parent.getAttribute('aria-hidden') === 'true' ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        return false;
      }
    }
    return true;
  };
  const open = () => {
    if (window[key]) {
      return 'busy';
    }
    const cell = [...document.querySelectorAll(item)].find(visible);
    let root = cell?.parentElement;
    while (
      root &&
      !/^(?:auto|scroll)$/.test(getComputedStyle(root).overflowY)
    ) {
      root = root.parentElement;
    }
    root ??= document.scrollingElement;
    if (!root || !cell) {
      return 'unavailable';
    }
    const state = {
      token,
      root,
      visible,
      original: root.scrollTop,
      interrupted: false,
    };
    state.events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input'];
    state.mark = (event) => {
      if (event.isTrusted) {
        state.interrupted = true;
      }
    };
    for (const type of state.events) {
      document.addEventListener(type, state.mark, {
        capture: true,
        passive: true,
      });
    }
    window[key] = state;
    root.scrollTop = 0;
    return null;
  };
  const release = (state) => {
    for (const type of state.events) {
      document.removeEventListener(type, state.mark, true);
    }
    const restored = Boolean(
      restore && !state.interrupted && state.root.isConnected
    );
    if (restored) {
      state.root.scrollTop = state.original;
    }
    delete window[key];
    return { state: 'released', restored };
  };
  const read = (state) => {
    if (state.interrupted) {
      return { state: 'owner-active' };
    }
    if (!state.root.isConnected) {
      return { state: 'changed' };
    }
    if (operation === 'move') {
      state.root.scrollTop = top;
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
        state.root.querySelector('[aria-busy="true"], [role="progressbar"]')
      ),
    };
  };
  if (operation === 'open') {
    const refused = open();
    if (refused) {
      return { state: refused };
    }
  }
  const state = window[key];
  if (!state || state.token !== token) {
    return { state: 'unavailable' };
  }
  return operation === 'release' ? release(state) : read(state);
};
