import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { attachDesktopLifecycle } from '../electron/lifecycle.js';
import { startDesktop, createMainWindow } from '../electron/main.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => globalThis.setImmediate(resolve));
const fixture = (options = {}) => {
  const app = new EventEmitter();
  const calls = { closes: 0, quits: 0, prevented: 0, creates: 0 };
  const window = { show() {}, focus() {} };
  let windows = [];
  app.quit = () => {
    const event = { preventDefault: () => calls.prevented++ };
    app.emit('before-quit', event);
    calls.quits++;
  };
  return {
    app,
    calls,
    BrowserWindow: { getAllWindows: () => windows },
    handle: {
      close: () => {
        calls.closes++;
        return options.drain?.promise;
      },
    },
    createWindow: async () => {
      calls.creates++;
      await options.paint?.promise;
      windows = [window];
      return window;
    },
  };
};

test('macOS Quit prevents exit until one owned server drain settles', async () => {
  const drain = deferred();
  const f = fixture({ drain });
  const lifecycle = await attachDesktopLifecycle({ ...f, platform: 'darwin' });
  const event = { preventDefault: () => f.calls.prevented++ };
  f.app.emit('before-quit', event);
  f.app.emit('before-quit', event);
  f.app.emit('activate');
  await turn();
  assert.equal(f.calls.closes, 1);
  assert.equal(f.calls.quits, 0);
  assert.equal(f.calls.prevented, 2);
  assert.equal(f.calls.creates, 1);
  drain.resolve();
  await lifecycle.close();
  await turn();
  assert.equal(f.calls.quits, 1);
  assert.equal(f.calls.closes, 1);
  assert.equal(f.calls.prevented, 2, 'final Quit proceeds without prevention');
  lifecycle.dispose();
  assert.equal(f.app.listenerCount('before-quit'), 0);
});

test('overlapping activation shares one pending window and focuses the existing one', async () => {
  const paint = deferred();
  const f = fixture({ paint });
  const starting = attachDesktopLifecycle({ ...f, platform: 'darwin' });
  f.app.emit('activate');
  f.app.emit('activate');
  await turn();
  assert.equal(f.calls.creates, 1);
  paint.resolve();
  const lifecycle = await starting;
  await lifecycle.show();
  assert.equal(f.calls.creates, 1);
  f.app.emit('window-all-closed');
  assert.equal(f.calls.quits, 0, 'macOS window close keeps the app available');
  await lifecycle.close();
  assert.equal(await lifecycle.show(), null);
  lifecycle.dispose();
});

test('non-macOS last-window closure uses the same draining Quit path', async () => {
  const drain = deferred();
  const f = fixture({ drain });
  const lifecycle = await attachDesktopLifecycle({ ...f, platform: 'win32' });
  f.app.emit('window-all-closed');
  await turn();
  assert.equal(f.calls.closes, 1);
  assert.equal(f.calls.quits, 1);
  assert.equal(f.calls.prevented, 1);
  drain.resolve();
  await lifecycle.close();
  await turn();
  assert.equal(f.calls.quits, 2);
  assert.equal(f.calls.prevented, 1);
  lifecycle.dispose();
});

test('failed drain reports an error and never claims the runtime has stopped', async () => {
  const drain = deferred();
  const f = fixture({ drain });
  const errors = [];
  const lifecycle = await attachDesktopLifecycle({
    ...f,
    report: (e) => errors.push(e),
  });
  f.app.emit('before-quit', { preventDefault() {} });
  const failure = new Error('held store could not close');
  drain.reject(failure);
  await assert.rejects(lifecycle.close(), failure);
  await turn();
  assert.deepEqual(errors, [failure]);
  assert.equal(f.calls.quits, 0);
  lifecycle.dispose();
});

test('startup failure drains the already opened runtime and removes app handlers', async () => {
  const app = new EventEmitter();
  app.whenReady = async () => {};
  app.getPath = () => '/unused-fixture';
  let closed = 0;
  let destroyed = 0;
  class BrokenWindow {
    static getAllWindows() {
      return [];
    }
    once() {}
    async loadURL() {
      throw new Error('synthetic renderer refusal');
    }
    destroy() {
      destroyed++;
    }
  }
  await assert.rejects(
    startDesktop({
      electronLoader: async () => ({ app, BrowserWindow: BrokenWindow }),
      serverLoader: async () => ({
        startServer: async () => ({
          port: 1,
          close: async () => {
            closed++;
          },
        }),
      }),
      updaterLoader: async () => null,
    }),
    /synthetic renderer refusal/
  );
  assert.equal(closed, 1);
  assert.equal(destroyed, 1);
  assert.equal(app.listenerCount('activate'), 0);
  assert.equal(app.listenerCount('before-quit'), 0);
});

test('a failed window load destroys the blank window before surfacing the failure', async () => {
  let destroyed = 0;
  class Window {
    once() {}
    async loadURL() {
      throw new Error('offline renderer');
    }
    destroy() {
      destroyed++;
    }
  }
  await assert.rejects(
    createMainWindow({ BrowserWindow: Window, port: 1 }),
    /offline renderer/
  );
  assert.equal(destroyed, 1);
});

test('Quit racing a renderer startup failure shares the same server drain', async () => {
  const app = new EventEmitter();
  app.whenReady = async () => {};
  app.getPath = () => '/unused-fixture';
  app.quit = () => {};
  const paint = deferred();
  const drain = deferred();
  let closed = 0;
  class Window {
    static getAllWindows() {
      return [];
    }
    once() {}
    loadURL() {
      return paint.promise;
    }
    destroy() {}
  }
  const starting = startDesktop({
    electronLoader: async () => ({ app, BrowserWindow: Window }),
    serverLoader: async () => ({
      startServer: async () => ({
        port: 1,
        close: () => {
          closed++;
          return drain.promise;
        },
      }),
    }),
    updaterLoader: async () => null,
  });
  await turn();
  app.emit('before-quit', { preventDefault() {} });
  paint.reject(new Error('synthetic startup failure during Quit'));
  const rejected = assert.rejects(starting, /startup failure during Quit/);
  await turn();
  assert.equal(closed, 1);
  drain.resolve();
  await rejected;
  assert.equal(closed, 1);
  assert.equal(app.listenerCount('before-quit'), 0);
});
