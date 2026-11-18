import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout, clearTimeout } from 'node:timers';

// Workers, including immutable release snapshots, share the installed modules.
// Auto mode with --no-lock would resolve newer ranges and install them at startup.
export const workerArgs = (entry, versions = process.versions) =>
  versions.deno
    ? ['run', '--allow-all', '--no-lock', '--node-modules-dir=manual', entry]
    : [entry];

const workerLifecycleLog = (log) => {
  const started = globalThis.performance.now();
  const phase = (name, details = '') => {
    if (process.env.MS_LIFECYCLE_DEBUG === '1') {
      console.error(
        `[rolling-worker] ${name} after ${Math.round(globalThis.performance.now() - started)} ms${details}`
      );
    }
  };
  phase('spawning');
  const report = (entry) => {
    if (
      entry?.phase === 'importing' &&
      [
        'server_resource_baseline',
        'server_resources',
        'server_import_resources_final',
      ].includes(entry.event)
    ) {
      const values = ['cpuPercent', 'rssBytes', 'schedulerLagMs'].map(
        (name) => entry[name]
      );
      if (values.every((value) => Number.isFinite(value) && value >= 0)) {
        phase(
          entry.event === 'server_import_resources_final'
            ? 'import_resources_final'
            : 'import_resources',
          ` (cpu_percent=${values[0]}, rss_bytes=${values[1]}, loop_lag_ms=${values[2]})`
        );
      }
    }
    if (
      entry?.event === 'server_worker_operation' &&
      ['init', 'import'].includes(entry.operation) &&
      ['started', 'finished', 'failed'].includes(entry.phase)
    ) {
      phase(`${entry.operation}_${entry.phase}`);
    }
    log(entry);
  };
  return { phase, report };
};

const readWorkerMessages = (input, receive, log) => {
  const lines = createInterface({ input });
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      if (message.type === 'log' || message.type === 'response') {
        receive(message);
        return;
      }
    } catch {
      /* A runtime/library diagnostic, not an IPC frame. */
    }
    log({
      level: 'debug',
      event: 'worker_output',
      message: line.slice(0, 2000),
    });
  });
};

export const spawnWorker = ({
  entry,
  log = () => {},
  execPath = process.execPath,
  spawnChild = spawn,
}) => {
  const { phase, report } = workerLifecycleLog(log);
  const child = spawnChild(execPath, workerArgs(entry), {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  phase('spawn_returned');
  child.once('spawn', () => phase('spawned'));
  child.stdout.once('data', () => phase('stdout_received'));
  child.stderr.once('data', () => phase('stderr_received'));
  const pending = new Map();
  let sequence = 0;
  let port = null;
  let exited = false;
  let exitInfo = null;
  let onExit = () => {};
  let closing = null;
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const call = (operation, body, timeoutMs = 300_000) =>
    new Promise((resolve, reject) => {
      if (exited) {
        reject(
          Object.assign(new Error('application worker exited'), {
            code: 'WORKER_EXITED',
          })
        );
        return;
      }
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          Object.assign(
            new Error(`application worker ${operation} timed out`),
            { code: 'WORKER_TIMEOUT' }
          )
        );
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        `${JSON.stringify({ id, operation, body })}\n`,
        operation === 'init'
          ? (error) => phase(error ? 'init_write_failed' : 'init_written')
          : undefined
      );
    });
  const receive = (message) => {
    if (message.type === 'log') {
      report(message.entry);
      return;
    }
    const slot = pending.get(message.id);
    if (!slot) {
      return;
    }
    pending.delete(message.id);
    clearTimeout(slot.timer);
    port = message.result?.port ?? message.error?.port ?? port;
    if (message.error) {
      slot.reject(
        Object.assign(new Error(message.error.message), message.error)
      );
    } else {
      slot.resolve(message.result);
    }
  };
  readWorkerMessages(child.stdout, receive, log);
  const ended = (code, signal) => {
    if (exited) {
      return;
    }
    exited = true;
    phase('exited');
    exitInfo = { code, signal };
    pending.forEach((slot) => {
      clearTimeout(slot.timer);
      slot.reject(
        Object.assign(new Error('application worker exited'), {
          code: 'WORKER_EXITED',
        })
      );
    });
    pending.clear();
  };
  child.once('exit', ended);
  child.once('error', (error) => {
    phase('spawn_failed');
    ended(error.code, null);
  });
  // An IPC acknowledgment precedes process termination; even `exit` can
  // precede closure of the child's stdio. Keep the supervisor's ownership
  // until `close`, so store/cache files can be safely reused or removed.
  child.once('close', (code, signal) => {
    phase('closed');
    ended(code, signal);
    onExit(exitInfo);
    resolveClosed();
  });
  child.stdin.on('error', () => {});
  for (const stream of [child.stderr]) {
    stream.on('data', (chunk) =>
      log({
        level: 'debug',
        event: 'worker_output',
        message: String(chunk).slice(0, 2000),
      })
    );
  }
  return {
    call,
    get port() {
      return port;
    },
    get pid() {
      return child.pid;
    },
    get exited() {
      return exited;
    },
    onExit: (listener) => {
      onExit = listener;
    },
    // A failed warm reader owns no data writer and may be discarded safely.
    discard: () => {
      if (!exited) {
        child.kill('SIGTERM');
      }
      return closed;
    },
    close: () => {
      closing ??= (async () => {
        if (!exited) {
          try {
            await call('close');
          } catch (error) {
            if (!exited) {
              throw error;
            }
          }
        }
        await closed;
      })();
      return closing;
    },
  };
};
