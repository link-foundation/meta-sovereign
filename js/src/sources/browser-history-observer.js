/* global document, window, MutationObserver */
import { readBrowserChoices } from './browser-choice-reader.js';

/** Page-local snapshots precede asynchronous writes and later DOM replacement. */
export const observeBrowserHistory = (input, read) => {
  const key = Symbol.for('meta-sovereign.browser-history-observer.v1');
  const { token, operation } = input;
  const unavailable = (code) => ({ code });
  if (operation !== 'observeHistory') {
    const current = window[key];
    if (!current || current.token !== token) {
      return unavailable('question-history-capture-unavailable');
    }
    return current.finish(operation === 'releaseHistory');
  }
  if (window[key]) {
    return unavailable('question-history-capture-busy');
  }
  const state = {
    token,
    pending: new Set(),
    bytes: 0,
    last: new Map(),
    observed: 0,
    code: null,
  };
  const fail = (code) => {
    state.code ??= code;
    state.observer.disconnect();
  };
  const snapshotNow = () => {
    if (state.code) {
      return;
    }
    const snapshot = read(input.spec, false, true);
    if (snapshot.code || snapshot.chat !== String(input.target)) {
      fail(snapshot.code ?? 'answer-chat-unverified');
      return;
    }
    const rows = snapshot.messages.filter(
      (row) => state.last.get(row.id) !== JSON.stringify(row)
    );
    if (!rows.length) {
      return;
    }
    const value = { chat: snapshot.chat, rows };
    const bytes = JSON.stringify(value).length * 2;
    if (state.pending.size >= 64 || state.bytes + bytes > 2097152) {
      fail('question-history-capture-gap');
      return;
    }
    state.last = new Map(
      snapshot.messages.map((row) => [row.id, JSON.stringify(row)])
    );
    state.bytes += bytes;
    state.observed += rows.length;
    const pending = window[input.binding]({ token, snapshot: value });
    state.pending.add(pending);
    pending
      .catch(() => fail('question-history-save-failed'))
      .finally(() => {
        state.pending.delete(pending);
        state.bytes -= bytes;
      });
  };
  const capture = () => {
    try {
      snapshotNow();
    } catch {
      fail('question-history-capture-gap');
    }
  };
  state.finish = async (release) => {
    if (release) {
      state.observer.disconnect();
    } else {
      capture();
    }
    await Promise.allSettled([...state.pending]);
    if (release && window[key] === state) {
      delete window[key];
    }
    return state.code ? unavailable(state.code) : { observed: state.observed };
  };
  state.observer = new MutationObserver(capture);
  window[key] = state;
  state.observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      ...new Set(
        [
          'data-qa',
          'class',
          'style',
          'hidden',
          'aria-hidden',
          'href',
          input.spec.messages.idAttribute,
          input.spec.messages.timestampAttribute,
        ].filter(Boolean)
      ),
    ],
  });
  capture();
  return state.finish(false);
};

export const controlBrowserHistory = (input) =>
  observeBrowserHistory(input, readBrowserChoices);
