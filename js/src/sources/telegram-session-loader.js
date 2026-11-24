import Module, { createRequire } from 'node:module';

// teleproto 1.232.0 eagerly imports StoreSession -> store2, initializing
// Node's browser-storage getter even when only StringSession is used.
// Mirror its public session exports with lazy getters in the same CJS cache.
// No globals, dependency files or warning handlers are changed. StoreSession
// remains the original disk-backed implementation when explicitly requested.
export const deferTelegramDiskSession = (require) => {
  const file = require.resolve('teleproto/sessions');
  if (require.cache[file]) {
    return;
  }
  const local = createRequire(file);
  const seeded = new Module(file);
  seeded.filename = file;
  Object.defineProperty(seeded.exports, '__esModule', { value: true });
  // The 1.232.1 generated entry point imports this namespace explicitly;
  // older releases read the same public classes directly from exports.
  Object.defineProperty(seeded.exports, 'sessions_exports', {
    value: seeded.exports,
  });
  for (const [name, module] of [
    ['MemorySession', './Memory'],
    ['StringSession', './StringSession'],
    ['StoreSession', './StoreSession'],
    ['Session', './Abstract'],
  ]) {
    Object.defineProperty(seeded.exports, name, {
      enumerable: true,
      configurable: true,
      get: () => local(module)[name],
    });
  }
  seeded.loaded = true;
  require.cache[file] = seeded;
};
