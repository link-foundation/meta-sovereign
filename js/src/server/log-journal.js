import { randomUUID } from 'node:crypto';
import { formatServerLogLine } from './log.js';

/** Per-server bounded redacted tail; no timer, disk scan or durable secret copy. */
export const createLogJournal = ({
  sink = null,
  limit = 300,
  maxBytes = 256 * 1024,
} = {}) => {
  const session = randomUUID();
  let sequence = 0;
  let bytes = 0;
  const items = [];
  return {
    log(entry) {
      try {
        // Diagnostics reads do not generate their own endless polling traffic.
        if (
          entry.event === 'http' &&
          entry.path?.startsWith('/api/diagnostics/logs')
        ) {
          return;
        }
        const line = formatServerLogLine(entry).trimEnd();
        const text =
          line.length > 4096 ? `${line.slice(0, 4080)}… [truncated]` : line;
        const size = Buffer.byteLength(text);
        items.push({ id: ++sequence, text, size });
        bytes += size;
        while (items.length > limit || bytes > maxBytes) {
          bytes -= items.shift().size;
        }
      } catch {
        // A malformed diagnostic must not interrupt the operation it describes.
      }
      try {
        sink?.(entry);
      } catch {
        // Preserve the journal when an external sink cannot write.
      }
    },
    read({ after = 0, session: previous = null } = {}) {
      const reset =
        (previous !== null && previous !== session) || after > sequence;
      const cursor = reset ? 0 : after;
      return {
        ok: true,
        available: true,
        session,
        cursor: sequence,
        reset,
        dropped: cursor < sequence - items.length,
        items: items
          .filter((item) => item.id > cursor)
          .map(({ id, text }) => ({ id, text })),
      };
    },
  };
};
