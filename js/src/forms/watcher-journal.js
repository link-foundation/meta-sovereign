import path from 'node:path';
import { encodeWire } from '../transport/lino.js';
import { writeFileDurable } from '../storage/durable.js';
import { createFormJournal, formReportSnapshot } from './review-journal.js';
import { formReportMarkdown } from './report-markdown.js';

/** One write in flight and one coalesced checkpoint; private files are replaced. */
export const createWatcherJournal = (directory) => {
  const journal = createFormJournal({ maxBytes: 512 * 1024 });
  let timer;
  let pending = null;
  let dirty = false;
  let stopped = false;
  let error = null;
  const flush = async () => {
    if (pending) {
      await pending;
      return;
    }
    dirty = false;
    pending = writeFileDurable(
      path.join(directory, 'journal.lino'),
      encodeWire(journal.read())
    ).catch(() => {
      error = 'form-report-write';
    });
    await pending;
    pending = null;
    if (dirty && !stopped) {
      schedule();
    }
  };
  const schedule = () => {
    dirty = true;
    if (timer || pending || stopped) {
      return;
    }
    timer = globalThis.setTimeout(() => {
      timer = null;
      void flush();
    }, 500);
    timer.unref?.();
  };
  return {
    read: journal.read,
    error: () => error,
    capture(action, result) {
      journal.capture(action, result);
      schedule();
    },
    async learned(result) {
      journal.capture('learn', result);
      try {
        await writeFileDurable(
          path.join(directory, 'learning.md'),
          formReportMarkdown(formReportSnapshot(result))
        );
      } catch {
        error = 'form-report-write';
      }
      schedule();
    },
    async stop() {
      stopped = true;
      globalThis.clearTimeout(timer);
      await pending;
      await flush();
      if (error) {
        throw new Error('Form watcher journal persistence failed.');
      }
    },
  };
};
