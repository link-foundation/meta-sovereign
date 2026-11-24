import vm from 'node:vm';
import { observeBrowserHistory } from '../../js/src/sources/browser-history-observer.js';
import { providerChoiceUi } from './provider-choice-fixture.mjs';

/** Small page-isolated observer harness; real DOM delivery has native coverage. */
export const historyCaptureFixture = () => {
  const state = {
    snapshot: {
      chat: '7',
      messages: [{ id: '101', body: 'Question?', outgoing: false }],
    },
    bindings: new Map(),
    released: 0,
  };
  const window = {};
  const context = vm.createContext({
    window,
    document: { documentElement: {} },
    read: () => globalThis.structuredClone(state.snapshot),
    MutationObserver: class {
      constructor(callback) {
        state.change = callback;
      }
      observe() {
        state.connected = true;
      }
      disconnect() {
        state.connected = false;
      }
    },
  });
  const evaluate = async ({ args: [input] }) => {
    context.input = input;
    return vm.runInContext(
      `(${observeBrowserHistory.toString()})(input, read)`,
      context
    );
  };
  const document = {
    evaluate,
    async bindHistory(token, listener) {
      state.bindings.set(token, listener);
      window.capture = ({ token: key, snapshot }) =>
        state.bindings.get(key)(snapshot);
      return {
        binding: 'capture',
        release() {
          state.released++;
          state.bindings.delete(token);
        },
      };
    },
  };
  return {
    state,
    document,
    ui: providerChoiceUi('https://hh.ru'),
    target: '7',
    change(body, delivery = 'pending') {
      state.snapshot.messages = [{ id: '102', body, outgoing: true, delivery }];
      state.change();
    },
  };
};

export const historyWriteGate = () => {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
};
