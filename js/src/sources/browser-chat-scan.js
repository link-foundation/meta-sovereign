import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { extractChats } from './browser-actions.js';
import { browserChatListState } from './browser-chat-list-state.js';
import { resolveBrowserChatListDocument } from './browser-choice-document.js';

const failure = (message, code) =>
  Object.assign(new Error(message), { code, fallback: false });
const bounded = (value, fallback, minimum, maximum) => {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw failure('Invalid bounded browser chat-scan setting', 'bad-chat-scan');
  }
  return result;
};
export const normalizeChatScanOptions = (options = {}) => ({
  limit: bounded(options.limit, 500, 1, 5000),
  maxPasses: bounded(options.maxPasses, 100, 1, 500),
  budgetMs: bounded(options.budgetMs, 30000, 100, 120000),
  waitMs: bounded(options.waitMs, 150, 10, 1000),
  endWaitMs: bounded(options.endWaitMs, 2000, 100, 10000),
});
const stop = (scanReason) => {
  throw Object.assign(new Error('Browser chat scan stopped'), { scanReason });
};
const ready = async (control, operation, extra) => {
  const state = await control(operation, extra);
  if (state.state !== 'ready') {
    stop(state.state);
  }
  return state;
};
const release = async (control) => {
  let restore = false;
  try {
    restore = (await control('status')).state === 'ready';
  } catch {
    // The original frame may remain alive after its owner navigated away.
  }
  try {
    return Boolean((await control('release', { restore })).restored);
  } catch {
    // A destroyed document has no live listeners or scroll to restore.
    return false;
  }
};
const tracker = (settings, now) => {
  const rows = new Map();
  let previous;
  let stableSince;
  let passes = 0;
  return {
    get passes() {
      return passes;
    },
    accept(found, current) {
      for (const row of found) {
        if (!rows.has(row.chat) && rows.size === settings.limit) {
          break;
        }
        rows.set(row.chat, row);
      }
      passes++;
      if (rows.size >= settings.limit) {
        return 'row-limit';
      }
      const signature = JSON.stringify([current, found]);
      if (current.bottom && !current.loading && signature === previous) {
        stableSince ??= now();
        if (now() - stableSince >= settings.endWaitMs) {
          return 'rendered-end';
        }
      } else {
        stableSince = undefined;
      }
      previous = signature;
      return null;
    },
    result(reason, restored) {
      return {
        rows: [...rows.values()],
        restored,
        coverage: {
          complete: false,
          scope: 'rendered-list',
          endObserved: reason === 'rendered-end',
          reason,
          passes,
        },
      };
    },
  };
};

/** Traverse one owned rendered list; an observed DOM end is not provider proof. */
export const scanBrowserChatList = async (
  document,
  ui,
  options = {},
  { now = () => globalThis.performance.now(), pause = sleep } = {}
) => {
  const settings = normalizeChatScanOptions(options);
  const token = randomUUID();
  const started = now();
  const observed = tracker(settings, now);
  let reason = 'pass-limit';
  let restored;
  const control = (operation, extra = {}) =>
    document.evaluate({
      fn: browserChatListState,
      args: [{ operation, token, item: ui.chats.item, ...extra }],
    });
  const remaining = () => {
    if (options.signal?.aborted) {
      stop('cancelled');
    }
    const ms = settings.budgetMs - (now() - started);
    if (ms <= 0) {
      stop('time-limit');
    }
    return ms;
  };
  try {
    remaining();
    await ready(control, 'open');
    while (observed.passes < settings.maxPasses) {
      await pause(Math.min(settings.waitMs, remaining()));
      remaining();
      await ready(control, 'status');
      const found = await document.evaluate({
        fn: extractChats,
        args: [
          {
            ...ui.chats,
            limit: settings.limit,
            listToken: token,
          },
        ],
      });
      const current = await ready(control, 'status');
      const completed = observed.accept(found, current);
      if (completed) {
        reason = completed;
        break;
      }
      remaining();
      const top = current.top + Math.max(1, Math.floor(current.view * 0.7));
      await ready(control, 'move', { top });
    }
  } catch (error) {
    reason =
      error?.scanReason ??
      (error?.code === 'answer-chat-unverified'
        ? 'document-changed'
        : 'read-failed');
  } finally {
    restored = await release(control);
  }
  const result = observed.result(reason, restored);
  if (process.env.MS_BROWSER_CHAT_SCAN_DEBUG === '1') {
    console.error('[browser-chat-scan]', {
      passes: observed.passes,
      rows: result.rows.length,
      reason,
      restored,
    });
  }
  return result;
};

export const createBrowserChatScans = ({ uiFor, inList }) => {
  const pending = new Map();
  let closed = false;
  return {
    async scanChats({ source, ...options } = {}) {
      if (closed) {
        throw failure('The browser chat scanner is closed', 'browser-closed');
      }
      const ui = uiFor(source);
      if (!ui.chatScan || !ui.documents) {
        throw failure(
          'Bounded browser chat scans are unavailable for this provider',
          'unsupported-action'
        );
      }
      normalizeChatScanOptions(options);
      if (options.signal?.aborted) {
        throw failure('The browser chat scan was cancelled', 'cancelled');
      }
      const controller = new AbortController();
      const signal = options.signal
        ? globalThis.AbortSignal.any([options.signal, controller.signal])
        : controller.signal;
      const work = inList(
        source,
        async (commander, page) => {
          const document = await resolveBrowserChatListDocument(
            commander,
            page,
            ui
          );
          const receipt = await scanBrowserChatList(document, ui, {
            ...options,
            signal,
          });
          return {
            ...receipt,
            rows: receipt.rows.map((row) => ({
              ...row,
              source,
              via: 'browser',
            })),
          };
        },
        { signal }
      );
      pending.set(work, controller);
      try {
        return await work;
      } finally {
        pending.delete(work);
      }
    },
    async closeChatScans() {
      closed = true;
      for (const controller of pending.values()) {
        controller.abort();
      }
      await Promise.allSettled([...pending.keys()]);
    },
  };
};
