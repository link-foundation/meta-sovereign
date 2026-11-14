import { browserChatFilterState } from '../../js/src/sources/browser-chat-filter.js';
import { ownerState } from '../../js/tests/helpers/e2e-question-unread-controls.mjs';

const barrier = () => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  return {
    release,
    wait: async () => {
      let timer;
      try {
        await Promise.race([
          ready,
          new Promise((_, reject) => {
            timer = globalThis.setTimeout(
              () => reject(new Error('Unread fixture boundary did not settle')),
              10000
            );
          }),
        ]);
      } finally {
        globalThis.clearTimeout(timer);
      }
    },
  };
};

/** Three real passes, with finite gates around the third pass's native effects. */
export const unreadPollingBoundary = () => {
  const started = barrier();
  const scan = barrier();
  const completed = barrier();
  const returned = barrier();
  const snapshots = [];
  let filters = 0;
  return {
    snapshots,
    started,
    scan,
    completed,
    returned,
    afterBrowserEvaluate: async ({ input }) => {
      if (
        input.fn === browserChatFilterState &&
        input.args?.[0]?.operation === 'set' &&
        ++filters === 3
      ) {
        started.release();
        await scan.wait();
      }
    },
    onUnreadPass: async ({ page, result }) => {
      snapshots.push({ view: await ownerState(page), result });
      if (snapshots.length === 3) {
        completed.release();
        await returned.wait();
      }
    },
    release: () => {
      for (const gate of [started, scan, completed, returned]) {
        gate.release();
      }
    },
  };
};
