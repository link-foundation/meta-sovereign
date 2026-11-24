/** A session has its own file, independent of the host's rotating aggregate. */
import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, writeSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { formatServerLogLine, jsonLog } from './log.js';
import { verboseFlag } from './log-settings.js';
import { logField } from './log-value.js';

export const createSessionLog = async (storeDir) => {
  const directory = path.join(storeDir ?? defaultStoreDir(), 'logs');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const id = randomUUID();
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${id.slice(0, 8)}.log`;
  const file = path.join(directory, name);
  const fd = openSync(file, 'wx', 0o600);
  let dropped = 0;
  let closed = false;
  let verbose = true;
  return {
    file,
    metadata: () => ({ persisted: true, file: name, id, dropped, closed }),
    isVerbose: () => verbose,
    setVerbose: (value) => {
      verbose = value;
    },
    log(entry) {
      if (closed || (logField(entry, 'level') === 'debug' && !verbose)) {
        return;
      }
      try {
        // Regular-file writes finish before returning, including fatal startup
        // diagnostics. No unbounded stream queue can accumulate on a slow disk.
        const bytes = Buffer.from(formatServerLogLine(entry));
        let offset = 0;
        while (offset < bytes.length) {
          const written = writeSync(fd, bytes, offset, bytes.length - offset);
          if (!written) {
            throw new Error('session log write did not advance');
          }
          offset += written;
        }
      } catch {
        dropped++;
      }
    },
    close() {
      if (!closed) {
        closed = true;
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      }
    },
  };
};

export const withLoggedSession = async (options, start) => {
  options = {
    ...options,
    verbose: verboseFlag(options.verbose ?? process.env.MS_VERBOSE),
  };
  // Memory/test embedders own their sink; never write to the user's app folder.
  if (options.store) {
    return start(options);
  }
  const verbose = options.verbose ?? true;
  const session = await createSessionLog(options.storeDir);
  session.setVerbose(verbose);
  const aggregate =
    options.log ?? (process.env.MS_LOG_FORMAT === 'json' ? jsonLog() : null);
  const log = (entry) => {
    if (logField(entry, 'level') === 'debug' && !session.isVerbose()) {
      return;
    }
    session.log(entry);
    try {
      aggregate?.(entry);
    } catch {
      // The independent session survives an unavailable aggregate sink.
    }
  };
  const finish = (event, error) => {
    log({ event, ...(error ? { level: 'error', error } : {}) });
    try {
      session.close();
    } catch (closeError) {
      if (!error) {
        throw closeError;
      }
      log({
        level: 'error',
        event: 'runner_session_log_close_failed',
        error: closeError,
      });
    }
  };
  log({ event: 'runner_session_started', pid: process.pid });
  try {
    const handle = await start({
      ...options,
      log,
      diagnosticsSession: session,
    });
    log({ event: 'runner_session_ready', port: handle.port });
    let closing;
    // Preserve live accessors such as a rolling worker's replacement port.
    const owned = Object.create(
      Object.getPrototypeOf(handle),
      Object.getOwnPropertyDescriptors(handle)
    );
    owned.close = (...args) =>
      (closing ??= Promise.resolve()
        .then(() => handle.close(...args))
        .then(
          (result) => {
            finish('runner_session_closed');
            return result;
          },
          (error) => {
            finish('runner_session_close_failed', error);
            throw error;
          }
        ));
    return owned;
  } catch (error) {
    finish('runner_session_start_failed', error);
    throw error;
  }
};
