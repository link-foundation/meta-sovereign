import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { createRunnerTransport } from '../server/runner-transport.js';
import { workerArgs } from '../server/worker-client.js';

const require = createRequire(import.meta.url);
const failure = (code) =>
  Object.assign(
    new Error(
      code === 'browser-preparation-stopped'
        ? 'Browser preparation stopped.'
        : 'Chrome for Testing could not be prepared. Check network access and available disk space, then retry the browser operation.'
    ),
    { code }
  );
const stopped = () => failure('browser-preparation-stopped');
const executableReady = async (file) => {
  try {
    await access(file, constants.X_OK);
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

/** Run the installed version's CLI, never npx or a system package manager. */
export const installBrowserExecutable = async ({
  signal,
  cli = path.join(
    path.dirname(require.resolve('playwright/package.json')),
    'cli.js'
  ),
} = {}) => {
  const run = createRunnerTransport({
    deadlineMs: 300000,
    exec: (file, args, options, callback) =>
      execFile(
        file,
        args,
        {
          ...options,
          env: { ...options.env, ELECTRON_RUN_AS_NODE: '1' },
        },
        callback
      ),
    trace: () => {},
  });
  const reply = await run(
    // A packaged CLI may live inside app.asar, which cannot be a child cwd.
    { directory: os.tmpdir() },
    [
      process.execPath,
      ...workerArgs(cli),
      'install',
      'chromium',
      '--no-shell',
      '--no-progress',
      '--no-remove',
    ],
    { signal }
  );
  if (reply.code !== 0 || reply.aborted) {
    throw signal?.aborted ? stopped() : failure('browser-preparation-failed');
  }
};

// A cancelled caller releases only its own interest. The last caller cancels
// and awaits the actual child close; other owners can keep their download.
const joinPreparation = (entry, signal) =>
  new Promise((resolve, reject) => {
    const owner = {};
    entry.owners.add(owner);
    let finished = false;
    const finish = (error) => {
      if (finished) {
        return;
      }
      finished = true;
      entry.owners.delete(owner);
      signal?.removeEventListener('abort', abort);
      const refused = signal?.aborted ? stopped() : error;
      if (refused) {
        reject(refused);
      } else {
        resolve();
      }
    };
    const abort = () => {
      entry.owners.delete(owner);
      if (entry.owners.size) {
        finish(stopped());
      } else {
        entry.controller.abort();
        // entry.task finishes only after its installer has drained.
      }
    };
    entry.task.then(() => finish(), finish);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });

/** Only explicit launches prepare a missing binary. Availability stays read-only. */
export const createBrowserPreparation = ({
  load = () => import('playwright'),
  ready = executableReady,
  install = installBrowserExecutable,
  trace = (phase) => {
    if (process.env.MS_BROWSER_PREPARATION_DEBUG === '1') {
      console.error(`[browser-preparation] ${phase}`);
    }
  },
} = {}) => {
  const pending = new Map();
  return async ({ signal } = {}) => {
    if (signal?.aborted) {
      throw stopped();
    }
    const browser = await load();
    const file = browser.chromium.executablePath();
    const present = await ready(file);
    let entry = pending.get(file);
    if (!entry && present) {
      if (signal?.aborted) {
        throw stopped();
      }
      return;
    }
    if (signal?.aborted) {
      throw stopped();
    }
    if (!entry) {
      entry = { controller: new AbortController(), owners: new Set() };
      entry.task = Promise.resolve().then(async () => {
        trace('started');
        try {
          await install({ signal: entry.controller.signal });
        } catch {
          trace('failed');
          throw entry.controller.signal.aborted
            ? stopped()
            : failure('browser-preparation-failed');
        }
        if (!(await ready(file))) {
          throw failure('browser-preparation-unconfirmed');
        }
        trace('ready');
      });
      pending.set(file, entry);
      const release = () => {
        if (pending.get(file) === entry) {
          pending.delete(file);
        }
      };
      entry.task.then(release, release);
    }
    // A new owner cannot inherit the previous owners' cancelled installation.
    if (entry.controller.signal.aborted) {
      await entry.task.catch(() => {});
      throw stopped();
    }
    await joinPreparation(entry, signal);
  };
};

export const prepareBrowserExecutable = createBrowserPreparation();
