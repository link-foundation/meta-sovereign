// Observe one finite CLI consumer without a worker, provider or source build.
import { registerHooks } from 'node:module';

export const observeCliImports = async (invoke) => {
  const root = new URL('../../js/src/', import.meta.url).href;
  const loaded = new Set();
  const hooks = registerHooks({
    load(url, context, next) {
      if (url.startsWith(root)) {
        loaded.add(url.slice(root.length));
      }
      return next(url, context);
    },
  });
  const began = globalThis.performance.now();
  try {
    const { runCli } = await import('../../js/src/cli/index.js');
    return {
      ...(await invoke(runCli)),
      modules: [...loaded].sort(),
      moduleCount: loaded.size,
      elapsedMs: Math.round(globalThis.performance.now() - began),
      maxRssKiB: process.resourceUsage().maxRSS,
    };
  } finally {
    hooks.deregister();
  }
};
