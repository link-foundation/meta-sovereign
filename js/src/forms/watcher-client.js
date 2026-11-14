import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireStoreLock } from '../storage/store-lock.js';
import { writeFileDurable } from '../storage/durable.js';
import { encodeWire } from '../transport/lino.js';
import { workerArgs } from '../server/worker-client.js';
import { watcherRequest } from './watcher-rpc.js';
import { waitForWatcherStop } from './watcher-management.js';
import {
  watcherDirectory,
  watcherFile,
  readWatcherFile,
  watcherAlive,
} from './watcher-files.js';

const entry = fileURLToPath(new URL('./watcher-worker.js', import.meta.url));
const waitForStart = async (file, child, token) => {
  let launchError;
  child.once('error', (error) => {
    launchError = error;
  });
  for (let attempt = 0; attempt < 300; attempt++) {
    if (launchError) {
      throw launchError;
    }
    const metadata = await readWatcherFile(file).catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    if (metadata?.token === token && metadata.pid === child.pid) {
      if (metadata.state === 'active') {
        return metadata;
      }
      if (['failed', 'stopped', 'stop-failed'].includes(metadata.state)) {
        throw new Error(metadata.message ?? 'Form watcher could not start.');
      }
    }
    if (child.exitCode !== null || child.signalCode) {
      throw new Error('Form watcher exited during startup.');
    }
    await delay(100);
  }
  throw new Error('Form watcher startup reached its time limit.');
};
const proxy = async (metadata, file, child) => {
  let current = await watcherRequest(metadata, 'status');
  let stopped = false;
  let polling = null;
  let pollingStopped = false;
  const call = async (operation, value) => {
    const result = await watcherRequest(metadata, operation, value);
    if (result?.answerLearning) {
      current = result;
    }
    return result;
  };
  const timer = globalThis.setInterval(() => {
    if (polling || pollingStopped) {
      return;
    }
    polling = call('status')
      .catch((error) => {
        current = {
          ...current,
          answerLearning: {
            ...current.answerLearning,
            state: 'failed',
            error: error.code ?? 'form-watcher-unavailable',
          },
        };
      })
      .finally(() => {
        polling = null;
      });
  }, 1000);
  timer.unref?.();
  return {
    detached: true,
    status: () => globalThis.structuredClone(current.answerLearning),
    monitoring: () => globalThis.structuredClone(current.monitoring),
    watcher: () => globalThis.structuredClone(current.watcher),
    arm: (report, options) => call('arm', { report, options }),
    applied: (result) => call('applied', result),
    pause: (busy) => call('pause', busy),
    history: () => call('history'),
    capture: (action, report) => call('checkpoint', { action, report }),
    incomplete: () => {},
    detach: async () => {
      pollingStopped = true;
      globalThis.clearInterval(timer);
      await polling;
    },
    async stop() {
      if (stopped) {
        return;
      }
      pollingStopped = true;
      globalThis.clearInterval(timer);
      await polling;
      await call('stop').catch(async (error) => {
        const state = await readWatcherFile(file);
        if (
          !['stopped', 'stop-failed'].includes(state.state) &&
          !watcherAlive(state.pid)
        ) {
          throw error;
        }
      });
      await waitForWatcherStop(file, metadata.token);
      if (child && child.exitCode === null && !child.signalCode) {
        await new Promise((resolve) => child.once('close', resolve));
      }
      stopped = true;
    },
  };
};

/** One detached worker per durable store/slot; existing live workers are reused. */
export const startFormWatcher = async ({
  directory,
  slot,
  id,
  browser,
  idleMs,
}) => {
  const watchDirectory = watcherDirectory(directory, slot);
  const lease = await acquireStoreLock(watchDirectory, { exclusive: true });
  let child;
  let bootstrap;
  try {
    const file = watcherFile(watchDirectory);
    const previous = await readWatcherFile(file).catch((error) => {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    });
    if (previous && watcherAlive(previous.pid)) {
      if (
        previous.state !== 'active' ||
        previous.targetId !== browser.targetId ||
        previous.profileDir !== browser.profileDir
      ) {
        throw new Error('Another watcher still owns this form slot.');
      }
      return { ...(await proxy(previous, file)), reused: true };
    }
    const token = randomBytes(32).toString('hex');
    bootstrap = path.join(watchDirectory, `launch-${randomUUID()}.lino`);
    await writeFileDurable(
      bootstrap,
      encodeWire({
        version: 1,
        token,
        id,
        slot,
        idleMs,
        targetId: browser.targetId,
        profileDir: browser.profileDir,
        storeDirectory: path.resolve(directory),
        watchDirectory,
      })
    );
    child = spawn(process.execPath, [...workerArgs(entry), bootstrap], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    const metadata = await waitForStart(file, child, token);
    return await proxy(metadata, file, child);
  } catch (error) {
    if (child?.pid && child.exitCode === null && !child.signalCode) {
      const closed = new Promise((resolve) => child.once('close', resolve));
      child.kill('SIGTERM');
      await closed;
    }
    throw error;
  } finally {
    if (bootstrap) {
      await fs.rm(bootstrap, { force: true });
    }
    lease.release();
  }
};
