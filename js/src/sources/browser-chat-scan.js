import { setTimeout as sleep } from 'node:timers/promises';
import { extractChats } from './browser-actions.js';
import { createBrowserScanControl } from './browser-scan-control.js';
import {
  resolveBrowserChatListDocument,
  resolveBrowserChoiceDocument,
} from './browser-choice-document.js';
import { scanBrowserConversation } from './browser-conversation-history.js';
import { normalizeChatScanOptions } from './browser-scan-options.js';
import { withBrowserChatFilter } from './browser-chat-filter.js';
import {
  normalizeUnreadScanOptions,
  scanUnreadBrowserConversations,
} from './browser-unread-conversations.js';
export { normalizeChatScanOptions } from './browser-scan-options.js';

const failure = (message, code) =>
  Object.assign(new Error(message), { code, fallback: false });
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
const traverseBrowserChatList = async (
  document,
  ui,
  options = {},
  { now = () => globalThis.performance.now(), pause = sleep } = {}
) => {
  const settings = normalizeChatScanOptions(options);
  const { token, control: scrollControl } = createBrowserScanControl(document, {
    item: ui.chats.item,
    inactiveToken: options.inactiveToken,
  });
  const control = async (operation, extra) => {
    if (operation !== 'release') {
      await options.verifyCurrent?.();
    }
    return scrollControl(operation, extra);
  };
  const started = now();
  const observed = tracker(settings, now);
  let reason = 'pass-limit';
  let restored;
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
      if (options.unreadOnly === true && found.some((row) => row.unread <= 0)) {
        stop('filter-unconfirmed');
      }
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

export const scanBrowserChatList = async (
  document,
  ui,
  options = {},
  dependencies = {}
) => {
  const settings = normalizeChatScanOptions(options);
  if (options.unreadOnly === undefined) {
    return traverseBrowserChatList(document, ui, options, dependencies);
  }
  if (!ui.chatScan?.unreadFilter) {
    throw failure(
      'Explicit unread filtering is unavailable for this provider',
      'unsupported-action'
    );
  }
  return withBrowserChatFilter(
    document,
    ui,
    { ...options, waitMs: settings.waitMs },
    (verify) =>
      traverseBrowserChatList(
        document,
        ui,
        {
          ...options,
          verifyCurrent: async () => {
            await options.verifyCurrent?.();
            await verify();
          },
        },
        dependencies
      ),
    dependencies.pause
  );
};

const supportsUnreadNavigation = (ui, inExisting) =>
  ui.chatNavigation?.sameDocument &&
  ui.documents &&
  ui.historyScan &&
  ui.chatScan?.unreadFilter &&
  inExisting;

export const createBrowserChatScans = ({
  uiFor,
  inList,
  inChat,
  inExisting,
}) => {
  const pending = new Map();
  let closed = false;
  const start = async (options, work) => {
    if (closed) {
      throw failure('The browser chat scanner is closed', 'browser-closed');
    }
    normalizeChatScanOptions(options);
    if (options.signal?.aborted) {
      throw failure('The browser chat scan was cancelled', 'cancelled');
    }
    const controller = new AbortController();
    const signal = options.signal
      ? globalThis.AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const result = work(signal);
    pending.set(result, controller);
    try {
      return await result;
    } finally {
      pending.delete(result);
    }
  };
  return {
    async scanUnreadConversations({ source, ...options } = {}) {
      if (closed) {
        throw failure('The browser chat scanner is closed', 'browser-closed');
      }
      normalizeUnreadScanOptions(options);
      const ui = uiFor(source);
      if (!supportsUnreadNavigation(ui, inExisting)) {
        throw failure(
          'Inactive unread traversal is unavailable for this provider',
          'unsupported-action'
        );
      }
      return start(options, (signal) =>
        inExisting(
          source,
          (commander, page) =>
            scanUnreadBrowserConversations({
              ...options,
              commander,
              page,
              ui,
              scanList: scanBrowserChatList,
              signal,
            }),
          { signal }
        )
      );
    },
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
      if (options.unreadOnly !== undefined && !ui.chatScan.unreadFilter) {
        throw failure(
          'Explicit unread filtering is unavailable for this provider',
          'unsupported-action'
        );
      }
      return start(options, (signal) =>
        inList(
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
        )
      );
    },
    async scanConversation({ source, chat, to, browserUrl, ...options } = {}) {
      if (closed) {
        throw failure('The browser chat scanner is closed', 'browser-closed');
      }
      const ui = uiFor(source);
      if (!ui.historyScan || !ui.documents || !inChat) {
        throw failure(
          'Bounded conversation traversal is unavailable for this provider',
          'unsupported-action'
        );
      }
      const target = ui.target({ chat, to });
      return start(options, (signal) =>
        inChat(
          source,
          target,
          { browserUrl, signal },
          async (commander, page) => {
            const document = await resolveBrowserChoiceDocument(
              commander,
              page,
              ui,
              target
            );
            return {
              ...(await scanBrowserConversation(document, ui, target, {
                ...options,
                signal,
              })),
              source,
              chat: String(target),
              via: 'browser',
            };
          }
        )
      );
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
