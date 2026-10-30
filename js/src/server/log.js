/**
 * Structured logging for the server (ROADMAP §7).
 *
 * Two factories share one line format — one JSON object per line:
 *
 *   {"ts":"2024-01-01T00:00:00.000Z","level":"info","event":"http",
 *    "method":"GET","path":"/links","status":200,"duration_ms":3}
 *
 *   jsonLog()          opt-in stdout logger (set MS_LOG_FORMAT=json). Default
 *                      server mode keeps stdout silent so unit tests stay
 *                      clean; tests can pass their own `write` to capture.
 *   createServerLog()  the running app's verbose logger: every entry is
 *                      appended to a file inside the app's data folder AND
 *                      echoed to stdout, so each run leaves a full trace on
 *                      disk that makes root-causing any issue easy. This is
 *                      on by default for `meta-sovereign serve`.
 */

import { createWriteStream, openSync, statSync, unlinkSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { defaultStoreDir } from '../storage/app-directory.js';
import { redact } from './redact.js';
import { renameDurableSync } from '../storage/durable.js';

// A stray BigInt (e.g. a GramJS account id) must never crash a log write.
const safe = (_key, value) =>
  typeof value === 'bigint' ? value.toString() : value;

// Every line is redacted (tokens in URLs, Authorization, sessions, passwords)
// before it is written or echoed (R-Z2).
const formatLine = (entry) =>
  `${redact(
    JSON.stringify(
      { ts: new Date().toISOString(), level: entry.level ?? 'info', ...entry },
      safe
    )
  )}\n`;

// The log is rotated by size: meta-sovereign.log -> .1 -> .2 ... (R-Z2).
const MAX_BYTES = 10 * 1024 * 1024;
const KEEP_FILES = 3;

const rotate = (file, keep) => {
  try {
    unlinkSync(`${file}.${keep}`);
  } catch {
    // none that old
  }
  for (let n = keep - 1; n >= 1; n -= 1) {
    try {
      renameDurableSync(`${file}.${n}`, `${file}.${n + 1}`);
    } catch {
      // gap in the series
    }
  }
  // Still held after the retries (Windows): keep writing to this file and
  // try again once it has grown by another `maxBytes`.
  try {
    renameDurableSync(file, `${file}.1`);
    return true;
  } catch {
    return false;
  }
};

const sizeOf = (file) => {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
};

/**
 * Wrap sinks so a log line never throws (R-Z14): a full disk made a
 * stdout/file write throw inside the uncaughtException handler, and the
 * logger crashed while reporting a crash. A line that cannot be written is
 * counted; the next time writing works one `log_lines_dropped` summary
 * (with the count) is written first.
 */
export const createSafeWriter = (sinks) => {
  let dropped = 0;
  const attempt = (sink, line) => {
    try {
      sink(line);
      return true;
    } catch {
      return false;
    }
  };
  const write = (line) => {
    let ok = true;
    for (const sink of sinks) {
      ok = attempt(sink, line) && ok;
    }
    return ok;
  };
  const emit = (line) => {
    if (dropped > 0) {
      const summary = formatLine({
        level: 'warn',
        event: 'log_lines_dropped',
        count: dropped,
      });
      if (write(summary)) {
        dropped = 0;
      }
    }
    if (!write(line)) {
      dropped += 1;
    }
  };
  emit.drop = () => {
    dropped += 1; // lost later (an asynchronous stream error)
  };
  emit.dropped = () => dropped;
  return emit;
};

export const jsonLog = ({
  write = (line) => process.stdout.write(line),
} = {}) => {
  const emit = createSafeWriter([write]);
  return (entry) => emit(formatLine(entry));
};

/**
 * The verbose, file-backed logger the running server uses by default.
 * Appends every entry to `<storeDir>/logs/meta-sovereign.log` and (unless
 * `toStdout` is false) mirrors it to stdout. Returns the logger, the log
 * file path (so the CLI can point the user at it), and a `close()`.
 * Writing never throws; see `createSafeWriter`.
 */
export const createServerLog = async ({
  storeDir,
  fileName = 'meta-sovereign.log',
  toStdout = true,
  maxBytes = MAX_BYTES,
  keep = KEEP_FILES,
  stdout = (line) => process.stdout.write(line),
} = {}) => {
  const dir = path.join(storeDir ?? defaultStoreDir(), 'logs');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => {});
  const file = path.join(dir, path.basename(fileName));
  let size = sizeOf(file);
  if (size >= maxBytes) {
    rotate(file, keep);
    size = 0;
  }
  let emit = null;
  const open = () => {
    // Opened now, not lazily, so a rotation right after finds the file.
    const stream = createWriteStream(file, {
      fd: openSync(file, 'a', 0o600),
    });
    // A full disk must not crash the server; the failed stream is
    // replaced on the next line, and what it lost is counted.
    stream.on('error', () => {
      emit?.drop();
      if (out === stream) {
        out = null;
      }
    });
    return stream;
  };
  let out = open();
  await chmod(file, 0o600).catch(() => {}); // an older log was 0644
  const toFile = (line) => {
    if (size + line.length > maxBytes && size > 0) {
      size = 0;
      // The old stream keeps writing to the renamed file until it ends.
      if (rotate(file, keep)) {
        const finished = out;
        out = null;
        finished?.end();
      }
    }
    out ??= open();
    out.write(line);
    size += line.length;
  };
  emit = createSafeWriter([toFile, ...(toStdout ? [stdout] : [])]);
  const log = (entry) => emit(formatLine(entry));
  log({ level: 'info', event: 'log_opened', file, pid: process.pid });
  return {
    log,
    file,
    dropped: emit.dropped,
    close: () => new Promise((resolve) => (out ? out.end(resolve) : resolve())),
  };
};

/**
 * Route a process's last-resort failures into `log` with their stack, so an
 * uncaught exception or a dropped promise is never lost to a bare console.
 * Returns an uninstaller for tests. The process is NOT killed — a local app
 * keeps serving, and the full trace is on disk for the user to read.
 */
export const installCrashLogging = (log) => {
  // A handler that throws would crash the process while reporting one (R-Z14).
  const report = (event) => (cause) => {
    try {
      log({
        level: 'error',
        event,
        error: String(cause?.message ?? cause), // redacted by the logger
        stack: cause?.stack ?? null,
      });
    } catch {
      // nothing left to report to
    }
  };
  const onException = report('uncaught_exception');
  const onRejection = report('unhandled_rejection');
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
  };
};
