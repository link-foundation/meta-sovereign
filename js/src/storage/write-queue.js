/**
 * The writes of an append-only log that a full or failing disk could not
 * take (R-Z14).
 *
 * `push` puts bytes in the queue, `write` sends every queued byte to the
 * file (a partial write leaves the rest at the head, so a retry continues
 * the very line that was cut and no torn line is left). When a write
 * fails, `fail(error)` puts the queue in the degraded state: it keeps
 * what is waiting in memory (up to `maxQueueBytes`, then `guard` refuses
 * more with STORE_FULL), retries after `retryMs`, doubling up to
 * `retryMaxMs`, and says so through `onEvent` (`store_degraded`, then
 * `store_recovered` when a retry succeeds).
 *
 * The invariant: nothing the queue accepted is dropped silently. It is on
 * disk, or still queued.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FILE_MODE } from './durable.js';

export const RETRY_MS = 5000;
export const RETRY_MAX_MS = 60_000;
export const MAX_QUEUE_BYTES = 64 * 1024 * 1024;

export const storeError = (code, message, cause) =>
  Object.assign(new Error(message), {
    code,
    ...(cause ? { cause, diskCode: cause.code ?? null } : {}),
  });

/** What `put` rejects with when the batch it was in could not be written. */
export const writeFailed = (cause) =>
  storeError(
    'STORE_WRITE_FAILED',
    `the store could not write to disk (${cause?.code ?? cause?.message}); the change is kept in memory and written when the disk allows`,
    cause
  );

export const appendHandle = (filePath) => fs.open(filePath, 'a', FILE_MODE);

/**
 * @param {object} options
 *   filePath, openAppend(filePath) -> handle with write/close (injectable),
 *   enqueue(job)  the store's one-write-at-a-time lane,
 *   attempt()     what a retry runs (default: `write`),
 *   onRecovered() after a retry succeeded,
 *   open          the file ends without a newline (a crash tore its tail).
 */
export const createWriteQueue = ({
  filePath,
  openAppend = appendHandle,
  onEvent = () => {},
  enqueue,
  attempt = null,
  onRecovered = () => {},
  retryMs = RETRY_MS,
  retryMaxMs = RETRY_MAX_MS,
  maxQueueBytes = MAX_QUEUE_BYTES,
  open = false,
}) => {
  let torn = open;
  let queue = []; // Buffers not on disk yet, in order
  let queuedBytes = 0;
  let degraded = null; // { since, error, attempts } while writes fail
  let timer = null;

  // After a failed write the file may hold bytes the failure did not
  // report; `expected` is the size it should have, so a retry can tell.
  let expected = null;
  const write = async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    let confirmed = (await fs.stat(filePath).catch(() => null))?.size ?? 0;
    if (expected !== null && confirmed > expected) {
      torn = true; // a cut line is closed, then the whole text is written
    }
    const handle = await openAppend(filePath);
    try {
      if (torn) {
        await handle.write(Buffer.from('\n'));
        confirmed += 1;
        torn = false;
      }
      while (queue.length > 0) {
        const head = queue[0];
        const { bytesWritten } = await handle.write(head, 0, head.length);
        confirmed += bytesWritten;
        queuedBytes -= bytesWritten;
        queue =
          bytesWritten < head.length
            ? [head.subarray(bytesWritten), ...queue.slice(1)]
            : queue.slice(1);
      }
      expected = null;
    } catch (error) {
      expected = confirmed;
      throw error;
    } finally {
      await handle.close().catch(() => {});
    }
  };

  const scheduleRetry = () => {
    const wait = Math.min(retryMaxMs, retryMs * 2 ** (degraded.attempts - 1));
    timer = globalThis.setTimeout(() => {
      enqueue(retry).catch(() => {});
    }, wait);
    timer.unref?.();
  };

  // One try at the waiting writes; true when the disk took them.
  const retry = async () => {
    globalThis.clearTimeout(timer);
    timer = null;
    if (!degraded) {
      return true;
    }
    try {
      await (attempt ?? write)();
    } catch (error) {
      degraded.error = error;
      degraded.attempts += 1;
      scheduleRetry();
      return false;
    }
    const { since } = degraded;
    degraded = null;
    onRecovered();
    onEvent({
      level: 'info',
      event: 'store_recovered',
      down_ms: Date.now() - since,
    });
    return true;
  };

  return {
    write,
    retry,
    push(buffer) {
      queue.push(buffer);
      queuedBytes += buffer.length;
    },
    /** The disk refused a write: queue stays, retries are scheduled. */
    fail(error) {
      if (degraded) {
        degraded.error = error;
        return;
      }
      degraded = { since: Date.now(), error, attempts: 1 };
      onEvent({
        level: 'error',
        event: 'store_degraded',
        code: error?.code ?? null,
        queued_bytes: queuedBytes,
      });
      scheduleRetry();
    },
    /** The error to answer a write with while degraded, else null. */
    down: () => degraded?.error ?? null,
    /** Past the limit nothing more is accepted (before it touches memory). */
    guard() {
      if (queuedBytes >= maxQueueBytes) {
        throw storeError(
          'STORE_FULL',
          'the disk is full and the unwritten changes reached their limit; nothing more is accepted until the disk has room'
        );
      }
    },
    /** The file was rewritten whole: nothing is torn any more. */
    rewritten() {
      torn = false;
    },
    health: () => ({
      degraded: degraded !== null,
      queuedBytes,
      error: degraded?.error?.code ?? null,
    }),
  };
};
