import { setTimeout as sleep } from 'node:timers/promises';
import { createBrowserScanControl } from './browser-scan-control.js';
import { releaseBrowserConversation } from './browser-conversation-history.js';
import { readBrowserAnswerChoices } from './browser-choices.js';
import { sendBrowserTextReply } from './browser-text-reply.js';

const failure = (reason) =>
  Object.assign(new Error('The borrowed unread conversation is unavailable.'), {
    code: `browser-unread-${reason}`,
    fallback: false,
  });

const stableQuestion = async ({ read, checked, control, settings, pause }) => {
  let previous;
  for (let pass = 0; pass < settings.maxPasses; pass++) {
    await pause(settings.waitMs);
    await checked();
    const state = await control('status');
    if (state.state !== 'ready') {
      throw failure(state.state);
    }
    if (state.loading) {
      continue;
    }
    const snapshot = await read();
    await checked();
    const signature = JSON.stringify(snapshot);
    if (signature === previous) {
      return snapshot;
    }
    previous = signature;
  }
  throw failure('tail-unstable');
};

/** Borrow this visit's lease and queue slot; never open another watch or lease. */
export const withBrowserConversationTail = async (
  { document, ui, chat, settings, signal, token, verify },
  work,
  { pause = sleep, now = () => globalThis.performance.now() } = {}
) => {
  const { control: scrollControl } = createBrowserScanControl(document, {
    item: ui.messages.item,
    idAttribute: ui.messages.idAttribute,
    composer: ui.composer,
    scope: 'history',
    inactiveToken: token,
    allowOwnedInput: true,
    tailOnly: true,
    debug: process.env.MS_BROWSER_HISTORY_DEBUG === '1',
  });
  const control = async (operation, extra) => {
    const result = await scrollControl(operation, extra);
    if (process.env.MS_BROWSER_HISTORY_DEBUG === '1') {
      console.error('[browser-conversation-tail]', { operation, result });
    }
    return result;
  };
  const deadline = now() + settings.budgetMs;
  let closed = false;
  const pending = new Set();
  let queued = Promise.resolve();
  let value;
  let restored;
  const read = () =>
    readBrowserAnswerChoices(document, ui, chat, { preserveDraft: true });
  const checked = async () => {
    if (closed || signal?.aborted || now() >= deadline) {
      throw failure(closed ? 'visit-closed' : 'cancelled');
    }
    await verify();
    if (closed || signal?.aborted || now() >= deadline) {
      throw failure(closed ? 'visit-closed' : 'cancelled');
    }
  };
  const run = (action) => {
    const result = queued.then(async () => {
      await checked();
      return action();
    });
    queued = result.catch(() => {});
    pending.add(result);
    result.then(
      () => pending.delete(result),
      () => pending.delete(result)
    );
    return result;
  };
  try {
    await checked();
    if ((await control('open')).state !== 'ready') {
      throw failure('tail-unavailable');
    }
    const snapshot = await stableQuestion({
      read,
      checked,
      control,
      settings,
      pause,
    });
    value = await work({
      snapshot,
      readInactiveQuestion: () => run(read),
      replyTextInactive: (expected, text, verifyCurrent) =>
        run(() =>
          sendBrowserTextReply(document, ui, chat, expected, text, {
            receiptMs: settings.receiptMs,
            pollMs: settings.pollMs,
            inactiveToken: token,
            verifyCurrent: async () => {
              await checked();
              await verifyCurrent?.();
            },
          })
        ),
    });
  } finally {
    closed = true;
    await Promise.allSettled([...pending]);
    restored = await releaseBrowserConversation(
      control,
      pause,
      settings.waitMs,
      verify
    );
  }
  return { value, restored };
};
