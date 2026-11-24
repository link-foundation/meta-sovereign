import vm from 'node:vm';
import { HH_WEB_UI } from '../../js/src/sources/hh-web-ui.js';

/** Native checkbox/event contract with finite in-memory rows and no timers. */
export const chatFilterFixture = ({
  original = false,
  fallback = false,
  refuse = false,
} = {}) => {
  const listeners = new Map();
  const clicks = [];
  const element = (parentElement = null) => ({
    parentElement,
    isConnected: true,
    getClientRects: () => [{}],
    getAttribute: () => null,
  });
  const root = Object.assign(element(), { scrollTop: 300 });
  const row = element(root);
  const emit = (type, { trusted = true, target = {} } = {}) => {
    for (const fn of listeners.get(type) ?? []) {
      fn({ type, isTrusted: trusted, target });
    }
  };
  const checkbox = Object.assign(element(), {
    checked: original,
    disabled: false,
    click() {
      clicks.push(this);
      if (!refuse) {
        this.checked = !this.checked;
      }
      root.scrollTop = 0;
      emit('input', { target: this });
      emit('change', { target: this });
    },
  });
  let controls = fallback ? [] : [checkbox];
  let fallbacks = [checkbox];
  const spec = HH_WEB_UI.chatScan.unreadFilter;
  const document = {
    hasFocus: () => false,
    querySelectorAll: (selector) =>
      selector === spec.control
        ? controls
        : selector === spec.fallback
          ? fallbacks
          : [row],
    addEventListener(type, fn) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  };
  const window = { addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({
    document,
    window,
    getComputedStyle: (node) => ({
      overflowY: node === root ? 'auto' : 'visible',
      display: 'block',
      opacity: '1',
      visibility: 'visible',
    }),
  });
  return {
    root,
    checkbox,
    clicks,
    emit,
    window,
    listeners: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    replace() {
      controls = [{ ...checkbox }];
      fallbacks = controls;
    },
    ambiguous() {
      controls = [checkbox, { ...checkbox }];
    },
    evaluate({ fn, args: [input] }) {
      context.input = input;
      return vm.runInContext(`(${fn.toString()})(input)`, context);
    },
  };
};
