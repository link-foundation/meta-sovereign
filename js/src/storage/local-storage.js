// Web Storage belongs to a browser origin. Node exposes a lazy getter that
// warns (or throws) without --localstorage-file; SSR must not initialize it.
// Plain injected storage still works in tests and non-browser clients.
export const getLocalStorage = (env = globalThis) => {
  try {
    if (
      !env.window &&
      Object.getOwnPropertyDescriptor(env, 'localStorage')?.get
    ) {
      return null;
    }
    return env.localStorage ?? null;
  } catch {
    // Browsers can deny storage access for sandboxed or restricted origins.
    return null;
  }
};
