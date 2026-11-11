import vm from 'node:vm';

/** Finite document/event model; no browser, network, timers or global mutation. */
export const inactiveViewFixture = (focused = false) => {
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type).add(fn);
      },
      removeEventListener(type, fn) {
        listeners.get(type)?.delete(fn);
      },
      emit(type, isTrusted = true) {
        for (const fn of listeners.get(type) ?? []) {
          fn({ type, isTrusted });
        }
      },
      count: () =>
        [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    };
  };
  const document = { ...target(), hasFocus: () => focused };
  const window = target();
  const context = vm.createContext({ document, window });
  return {
    document,
    window,
    focus(value) {
      focused = value;
      window.emit('focus');
    },
    evaluate({ fn, args: [input] }) {
      context.input = input;
      return vm.runInContext(`(${fn.toString()})(input)`, context);
    },
    listeners: () => document.count() + window.count(),
  };
};
