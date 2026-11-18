// Model Electron's real ESM readiness ordering without a browser download.
// The pinned Electron loader finishes the main module before releasing ready.
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

let releaseReady;
let finish;
let readyRequested = false;
let profile;
const stalled = process.argv.includes('--stall');
if (stalled) {
  const schedule = globalThis.setTimeout;
  globalThis.setTimeout = (callback, milliseconds, ...args) =>
    schedule(
      callback,
      [15000, 2000].includes(milliseconds) ? 30 : milliseconds,
      ...args
    );
}
const ready = new Promise((resolve) => {
  releaseReady = resolve;
});
const completed = new Promise((resolve) => {
  finish = resolve;
});
globalThis.__vkEntryFixture = {
  setPath: (name, value) => {
    if (name === 'userData') {
      profile = value;
    }
  },
  ready: () => {
    readyRequested = true;
    return ready;
  },
  finish,
};
const electronFixture = `
export const app = {
  setPath(name, value) { globalThis.__vkEntryFixture.setPath(name, value); }, on() {},
  whenReady() { return globalThis.__vkEntryFixture.ready(); },
  exit(code) { globalThis.__vkEntryFixture.finish(code); }
};
export const ipcMain = {};
export const clipboard = {};
export class BrowserWindow {
  constructor() {
    throw Object.assign(new Error('finite entry fixture'), {code:'ENTRY_FIXTURE_REACHED'});
  }
}`;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'electron'
      ? {
          url: `data:text/javascript,${encodeURIComponent(electronFixture)}`,
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
const entry = new URL('./vk-token-electron.mjs', import.meta.url);
let url = entry.href;
if (process.argv.includes('--before')) {
  const source = execFileSync(
    'git',
    ['show', 'c4b904c3:experiments/issue-56/vk-token-electron.mjs'],
    { encoding: 'utf8' }
  );
  const absolute = source.replace(
    /from '(\.\.\/[^']+)'/gu,
    (_match, relative) => `from '${new URL(relative, entry).href}'`
  );
  url = `data:text/javascript,${encodeURIComponent(absolute)}`;
}
let evaluated = false;
const loaded = import(url).then(() => {
  evaluated = true;
  if (!stalled) {
    releaseReady();
  }
});
loaded.catch(() => finish('module-refused'));
const outcome = await Promise.race([
  completed,
  new Promise((resolve) =>
    globalThis.setTimeout(() => resolve('readiness-cycle'), 1000)
  ),
]);
hooks.deregister();
if (profile) {
  await rm(profile, { recursive: true, force: true });
}
console.log(JSON.stringify({ evaluated, readyRequested, outcome }));
// The parent case deliberately leaves a pending readiness promise, never a
// real window, server or provider. Bound it rather than awaiting the cycle.
process.exit(0);
