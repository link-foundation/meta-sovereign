import { setTimeout, clearTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import { readStoreLockState } from '../src/storage/store-lock.js';

const workerEntry = fileURLToPath(
  new URL('./local-runner-worker.js', import.meta.url)
);
const applicationStates = new Set(['ready', 'locked', 'degraded']);

const waitFor = (child, event, accept, { signal, timeout }) =>
  new Promise((resolve) => {
    const finish = (value) => {
      clearTimeout(timer);
      child.off(event, receive);
      if (event !== 'exit') {
        child.off('exit', fail);
      }
      signal?.removeEventListener('abort', fail);
      resolve(value);
    };
    const fail = () => finish(null);
    const receive = (message) => {
      if (accept(message)) {
        finish(message);
      }
    };
    const timer = setTimeout(fail, timeout);
    child.on(event, receive);
    if (event !== 'exit') {
      child.on('exit', fail);
    }
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted) {
      fail();
    }
  });

const send = (child, value) => {
  try {
    child.postMessage(value);
  } catch {
    // The child exit is observed independently of the IPC response.
  }
};

const sameTarget = (a, b) =>
  a.session === b.session && a.store === b.store && a.port === b.port;

const command = async (session, action, input, options) => {
  const id = ++session.request;
  const response = waitFor(
    session.child,
    'message',
    (value) => value?.request === id,
    options
  );
  if (!options.signal?.aborted) {
    send(session.child, { ...input, request: id, action });
  }
  return (await response)?.value;
};

const forkWorker = (utilityProcess) => {
  try {
    return utilityProcess.fork(workerEntry, [], {
      serviceName: 'Meta Sovereign Local Runner',
      stdio: 'ignore',
    });
  } catch {
    return null;
  }
};

const loadWorker = async (session, ownershipDirectory, signal, timeout) => {
  const deadline = globalThis.AbortSignal.timeout(timeout);
  const active = signal
    ? globalThis.AbortSignal.any([signal, deadline])
    : deadline;
  const options = { signal: active, timeout };
  // Electron cannot deliver messages before the utility channel opens.
  const connected = await waitFor(
    session.child,
    'message',
    (value) => value?.loaded === true,
    options
  );
  return connected && session.phase === 'loading'
    ? command(session, 'prepare', { ownershipDirectory }, options)
    : null;
};

const observed = { prepared: 'stopped', running: 'running' };

export const createDesktopLocalRunner = ({
  utilityProcess,
  ownershipDirectory,
  automationDefaults,
  secretPassphrase,
  startTimeout = 30000,
  stopTimeout = 10000,
}) => {
  let owned;
  let closing = false;
  const stop = async (session) => {
    if (owned !== session) {
      return true;
    }
    const exited = waitFor(session.child, 'exit', () => true, {
      timeout: stopTimeout,
    });
    if (session.phase !== 'stopping') {
      session.phase = 'stopping';
      send(session.child, { action: 'close' });
    }
    await exited;
    return owned !== session;
  };
  const stopPrepared = async (session) => {
    if (!session.startIssued && !(await stop(session))) {
      const exited = waitFor(session.child, 'exit', () => true, {
        timeout: stopTimeout,
      });
      session.child.kill();
      await exited;
    }
  };
  const start = async (session, { signal } = {}) => {
    if (owned !== session || session.phase !== 'prepared' || signal?.aborted) {
      return false;
    }
    session.startIssued = true;
    session.phase = 'starting';
    const { store, port } = session.target;
    const started = await command(
      session,
      'start',
      { store, port, automationDefaults, secretPassphrase },
      { signal, timeout: startTimeout }
    );
    if (owned !== session || session.phase === 'stopping') {
      return false;
    }
    if (started !== true || session.phase !== 'starting' || signal?.aborted) {
      await stop(session);
      return false;
    }
    session.phase = 'running';
    return true;
  };
  const prepare = async (target, { signal } = {}) => {
    if (closing || owned || signal?.aborted) {
      return null;
    }
    const child = forkWorker(utilityProcess);
    if (!child) {
      return null;
    }
    const session = { child, target, phase: 'loading', request: 0 };
    owned = session;
    child.on('error', () => {
      session.phase = 'failed';
    });
    child.once('exit', () => {
      session.phase = 'exited';
      if (owned === session) {
        owned = undefined;
      }
    });
    const reply = await loadWorker(
      session,
      ownershipDirectory,
      signal,
      startTimeout
    );
    if (
      reply !== true ||
      owned !== session ||
      session.phase !== 'loading' ||
      closing ||
      signal?.aborted
    ) {
      await stopPrepared(session);
      return null;
    }
    session.phase = 'prepared';
    return {
      start: (options) => start(session, options),
      dispose: () => stopPrepared(session),
    };
  };
  const status = async (target) => {
    if (!owned) {
      return (await readStoreLockState(ownershipDirectory)) === 'free'
        ? 'stopped'
        : 'unknown';
    }
    if (!sameTarget(owned.target, target)) {
      return 'unknown';
    }
    return observed[owned.phase] ?? 'unknown';
  };
  return {
    status,
    prepare,
    stop: (target) => owned && sameTarget(owned.target, target) && stop(owned),
    async inspect(target, { signal } = {}) {
      if (
        !owned ||
        !sameTarget(owned.target, target) ||
        owned.phase !== 'running'
      ) {
        return 'unknown';
      }
      const session = owned;
      const state = await command(
        session,
        'inspect',
        {},
        { signal, timeout: 2500 }
      );
      return owned === session &&
        session.phase === 'running' &&
        applicationStates.has(state)
        ? state
        : 'unknown';
    },
    async close() {
      closing = true;
      if (owned) {
        const session = owned;
        if (session.startIssued) {
          await stop(session);
        } else {
          await stopPrepared(session);
        }
      }
    },
  };
};
