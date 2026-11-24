const pages = new WeakMap();
const binding = '__metaSovereignHistoryV1';
const unavailable = () =>
  Object.assign(new Error('Browser history capture is unavailable.'), {
    code: 'question-history-capture-unavailable',
    fallback: false,
  });

/** One bounded subscription per owned frame; released callbacks cannot write. */
export const bindBrowserHistory = async (page, frame, token, onSnapshot) => {
  if (!page?.exposeBinding) {
    throw unavailable();
  }
  let state = pages.get(page);
  if (!state) {
    state = { listeners: new Map() };
    pages.set(page, state);
    state.ready = page.exposeBinding(binding, (source, input) => {
      const listener = state.listeners.get(input?.token);
      if (!listener || source.frame !== listener.frame) {
        throw unavailable();
      }
      return listener.onSnapshot(input.snapshot);
    });
  }
  await state.ready;
  if (state.listeners.size >= 32 || state.listeners.has(token)) {
    throw unavailable();
  }
  state.listeners.set(token, { frame, onSnapshot });
  return {
    binding,
    release: () => state.listeners.delete(token),
  };
};
