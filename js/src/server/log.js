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

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// A stray BigInt (e.g. a GramJS account id) must never crash a log write.
const safe = (_key, value) =>
  typeof value === 'bigint' ? value.toString() : value;

const formatLine = (entry) =>
  `${JSON.stringify(
    { ts: new Date().toISOString(), level: entry.level ?? 'info', ...entry },
    safe
  )}\n`;

export const jsonLog =
  ({ write = (line) => process.stdout.write(line) } = {}) =>
  (entry) =>
    write(formatLine(entry));

/**
 * The verbose, file-backed logger the running server uses by default.
 * Appends every entry to `<storeDir>/logs/meta-sovereign.log` and (unless
 * `toStdout` is false) mirrors it to stdout. Returns the logger, the log
 * file path (so the CLI can point the user at it), and a `close()`.
 */
export const createServerLog = async ({ storeDir, toStdout = true } = {}) => {
  const dir = path.join(storeDir ?? '.meta-sovereign', 'logs');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'meta-sovereign.log');
  const out = createWriteStream(file, { flags: 'a' });
  const log = (entry) => {
    const line = formatLine(entry);
    out.write(line);
    if (toStdout) {
      process.stdout.write(line);
    }
  };
  log({ level: 'info', event: 'log_opened', file, pid: process.pid });
  return {
    log,
    file,
    close: () => new Promise((resolve) => out.end(resolve)),
  };
};

/**
 * Route a process's last-resort failures into `log` with their stack, so an
 * uncaught exception or a dropped promise is never lost to a bare console.
 * Returns an uninstaller for tests. The process is NOT killed — a local app
 * keeps serving, and the full trace is on disk for the user to read.
 */
export const installCrashLogging = (log) => {
  const report = (event) => (cause) =>
    log({
      level: 'error',
      event,
      error: String(cause?.message ?? cause),
      stack: cause?.stack ?? null,
    });
  const onException = report('uncaught_exception');
  const onRejection = report('unhandled_rejection');
  process.on('uncaughtException', onException);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('uncaughtException', onException);
    process.off('unhandledRejection', onRejection);
  };
};
