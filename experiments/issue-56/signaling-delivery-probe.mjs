/** One native Deno message delay; the real RTC integration owns every socket. */
import assert from 'node:assert/strict';

assert(globalThis.Deno, 'Run this finite native-WebSocket probe with Deno.');
const NativeWebSocket = globalThis.WebSocket;
globalThis.WebSocket = class extends NativeWebSocket {
  pending = new Set();
  addEventListener(type, callback, options) {
    if (type !== 'message') {
      return super.addEventListener(type, callback, options);
    }
    return super.addEventListener(
      type,
      (event) => {
        const timer = globalThis.setTimeout(() => {
          this.pending.delete(timer);
          callback.call(this, event);
        }, 120);
        this.pending.add(timer);
      },
      options
    );
  }
  close(...args) {
    for (const timer of this.pending) {
      globalThis.clearTimeout(timer);
    }
    this.pending.clear();
    return super.close(...args);
  }
};
console.log('[signaling-delivery-probe] native Deno delivery held for 120 ms');
await import('../../js/tests/server-sync.test.js');
