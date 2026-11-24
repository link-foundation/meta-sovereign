// Execute the actual published entrypoint body against finite owned app mocks.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { attachDesktopLifecycle } from '../../js/electron/lifecycle.js';

const parent = '6e2116d98a9f31de79d8bfa683e604bfff257741';
const source = process.argv.includes('--before')
  ? execFileSync('git', ['show', `${parent}:js/electron/main.js`], {
      encoding: 'utf8',
    })
  : await readFile('js/electron/main.js', 'utf8');
const entry = source.slice(
  source.indexOf('export const startDesktop ='),
  source.indexOf('// Packaged apps load')
);
assert.ok(entry.includes('startDesktop') && entry.includes('startServer'));
const evaluate = new Function(
  'loadElectron',
  'loadAutoUpdater',
  'importServer',
  'createMainWindow',
  'resolveDesktopStoreDir',
  'configureAutoUpdates',
  'attachDesktopLifecycle',
  'process',
  `${entry
    .replace('export const', 'const')
    .replaceAll("import('../src/server/index.js')", 'importServer()')}
   return startDesktop();`
);
const result = [];
for (const failure of [false, true]) {
  const app = new EventEmitter();
  app.whenReady = async () => {};
  app.quit = () => {};
  const handle = {
    port: 1,
    close: async () => {
      calls.closes++;
    },
  };
  const calls = { closes: 0, prevented: 0 };
  let windows = [];
  const createWindow = async () => {
    if (failure) {
      throw new Error('synthetic window load refusal');
    }
    const window = { show() {} };
    windows = [window];
    return window;
  };
  try {
    const starting = evaluate(
      async () => ({ app, BrowserWindow: { getAllWindows: () => windows } }),
      async () => null,
      async () => ({ startServer: async () => handle }),
      createWindow,
      () => '/unused-fixture',
      () => {},
      attachDesktopLifecycle,
      { platform: 'darwin' }
    );
    if (failure) {
      await assert.rejects(starting, /synthetic window load refusal/);
    } else {
      await starting;
      app.emit('before-quit', { preventDefault: () => calls.prevented++ });
      await new Promise((resolve) => globalThis.setImmediate(resolve));
      assert.equal(calls.prevented, 1, 'macOS Quit must be held for draining');
    }
    assert.equal(
      calls.closes,
      1,
      failure
        ? 'failed startup must close the already opened server'
        : 'macOS Quit must drain the owned server'
    );
    result.push({
      scenario: failure ? 'startup-failure' : 'macos-quit',
      passed: true,
    });
  } catch (error) {
    result.push({
      scenario: failure ? 'startup-failure' : 'macos-quit',
      passed: false,
      error: error.message,
      calls,
    });
  }
}
console.log(
  JSON.stringify({
    parent,
    before: process.argv.includes('--before'),
    result,
    realElectron: false,
    liveProvider: false,
  })
);
assert.ok(
  result.every((item) => item.passed),
  'desktop entrypoint lifecycle failed'
);
