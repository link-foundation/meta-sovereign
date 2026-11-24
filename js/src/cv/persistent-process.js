import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const failure = () =>
  Object.assign(
    new Error('Persistent browser process closure was not confirmed.'),
    {
      code: 'browser-close-unconfirmed',
    }
  );
const exited = (child) =>
  child &&
  ((child.exitCode !== null && child.exitCode !== undefined) ||
    (child.signalCode !== null && child.signalCode !== undefined));
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') {
      return false;
    }
    if (error.code === 'EPERM') {
      return true;
    }
    throw failure();
  }
};

/** Capture the SDK-validated owner before Close removes its metadata file. */
export const persistentProcessOwner = async (session, profileDir) => {
  if (
    Number.isInteger(session.browserProcess?.pid) &&
    session.browserProcess.pid > 0
  ) {
    return { pid: session.browserProcess.pid, child: session.browserProcess };
  }
  try {
    const metadata = JSON.parse(
      await readFile(
        path.join(profileDir, '.browser-commander-session.json'),
        'utf8'
      )
    );
    if (
      !Number.isInteger(metadata.pid) ||
      metadata.pid < 1 ||
      !Number.isInteger(metadata.remoteDebuggingPort) ||
      metadata.remoteDebuggingPort < 1 ||
      metadata.remoteDebuggingPort > 65535 ||
      typeof metadata.userDataDir !== 'string' ||
      path.resolve(metadata.userDataDir) !== path.resolve(profileDir) ||
      session.cdpEndpoint !== `http://127.0.0.1:${metadata.remoteDebuggingPort}`
    ) {
      throw failure();
    }
    return { pid: metadata.pid };
  } catch {
    throw failure();
  }
};

/** An SDK close acknowledgement precedes process exit. Never signal a saved PID. */
export const createPersistentClose = (
  session,
  owner,
  { isAlive = alive, pause = delay, now = Date.now, deadlineMs = 5000 } = {}
) => {
  let closing;
  return () => {
    closing ??= (async () => {
      let closeError;
      if (process.env.MS_BROWSER_LIFECYCLE_DEBUG === '1') {
        console.error('[persistent-browser] close-requested');
      }
      try {
        await session.close();
      } catch (error) {
        closeError = error;
      }
      const deadline = now() + deadlineMs;
      while (!exited(owner.child) && isAlive(owner.pid)) {
        if (now() >= deadline) {
          throw failure();
        }
        await pause(25);
      }
      if (process.env.MS_BROWSER_LIFECYCLE_DEBUG === '1') {
        console.error('[persistent-browser] process-closed');
      }
      if (closeError) {
        throw closeError;
      }
    })();
    return closing;
  };
};
