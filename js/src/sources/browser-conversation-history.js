import { setTimeout as sleep } from 'node:timers/promises';
import { createBrowserScanControl } from './browser-scan-control.js';
import { readBrowserHistory } from './browser-choices.js';
import { normalizeChatScanOptions } from './browser-scan-options.js';

const stopped = (historyReason) => {
  throw Object.assign(new Error('Conversation history traversal stopped'), {
    historyReason,
  });
};

/** Overlapping windows establish chronology without interpreting provider IDs. */
export const mergeConversationWindow = (known, incoming) => {
  if (!known.length) {
    return incoming.slice();
  }
  const positions = new Map(known.map((row, index) => [row.id, index]));
  const shared = incoming.findIndex((row) => positions.has(row.id));
  if (shared < 0) {
    stopped('history-gap');
  }
  const offset = positions.get(incoming[shared].id);
  if (shared > 0 && offset !== 0) {
    stopped('history-gap');
  }
  for (let index = shared; index < incoming.length; index++) {
    if (
      JSON.stringify(incoming[index]) !==
      JSON.stringify(known[offset + index - shared])
    ) {
      stopped('conversation-changed');
    }
  }
  return [...incoming.slice(0, shared), ...known];
};

const releaseConversation = async (control, pause, waitMs) => {
  let restored = false;
  let restore = false;
  try {
    restore = (await control('status')).state === 'ready';
    if (restore) {
      await control('restore', { restore: true });
      await pause(waitMs);
      restore = (await control('status')).state === 'ready';
    }
  } catch {
    // A previous frame may still be alive after its owner navigated away.
  }
  try {
    restored = Boolean((await control('release', { restore })).restored);
  } catch {
    // A destroyed document has no scroll or listeners to restore.
  }
  return restored;
};

const conversationTracker = (settings, ui, now) => {
  let rows = [];
  let passes = 0;
  let previous;
  let stableSince;
  return {
    get passes() {
      return passes;
    },
    loading() {
      passes++;
    },
    accept(found, state) {
      const merged = mergeConversationWindow(rows, found);
      if (
        merged.length > settings.limit ||
        merged.reduce((sum, row) => sum + row.body.length, 0) > 1000000
      ) {
        stopped('history-limit');
      }
      rows = merged;
      passes++;
      if (
        state.oldest &&
        !state.loading &&
        rows[0]?.service &&
        ui.historyScan?.startAtService
      ) {
        return 'provider-start';
      }
      const signature = JSON.stringify([state.top, state.height, found]);
      if (state.oldest && !state.loading && signature === previous) {
        stableSince ??= now();
        if (now() - stableSince >= settings.endWaitMs) {
          return 'rendered-start';
        }
      } else {
        stableSince = undefined;
      }
      previous = signature;
      return null;
    },
    result(reason, restored) {
      return {
        rows,
        coverage: {
          complete: reason === 'provider-start',
          scope: 'conversation',
          reason,
          passes,
        },
        restored,
      };
    },
  };
};

/** A stable rendered edge is incomplete until the provider's start marker exists. */
export const scanBrowserConversation = async (
  document,
  ui,
  target,
  options = {},
  { now = () => globalThis.performance.now(), pause = sleep } = {}
) => {
  const settings = normalizeChatScanOptions(options);
  const { control } = createBrowserScanControl(document, {
    item: ui.messages.item,
    idAttribute: ui.messages.idAttribute,
    composer: ui.composer,
    scope: 'history',
  });
  const started = now();
  const observed = conversationTracker(settings, ui, now);
  let reason = 'pass-limit';
  let restored;
  const check = async (operation = 'status', extra) => {
    if (options.signal?.aborted) {
      stopped('cancelled');
    }
    if (now() - started >= settings.budgetMs) {
      stopped('time-limit');
    }
    const state = await control(operation, extra);
    if (state.state !== 'ready') {
      stopped(state.state);
    }
    return state;
  };
  try {
    await check('open');
    while (observed.passes < settings.maxPasses) {
      await pause(settings.waitMs);
      if ((await check()).loading) {
        observed.loading();
        continue;
      }
      // Options describe the current mounted tail, not older transcript rows.
      // A later send must independently inspect the current native controls.
      const found = (await readBrowserHistory(document, ui, target)).map(
        ({ strictOptions: _strict, answerOptions: _options, ...row }) => row
      );
      const state = await check();
      const completed = observed.accept(found, state);
      if (completed) {
        reason = completed;
        break;
      }
      await check('move', {
        top: state.top - Math.max(1, Math.floor(state.view * 0.7)),
      });
    }
  } catch (error) {
    reason =
      error.historyReason ??
      (error.code === 'answer-chat-unverified'
        ? 'document-changed'
        : 'read-failed');
  } finally {
    restored = await releaseConversation(control, pause, settings.waitMs);
  }
  const result = observed.result(reason, restored);
  if (process.env.MS_BROWSER_HISTORY_DEBUG === '1') {
    console.error('[browser-conversation-history]', {
      ...result.coverage,
      rows: result.rows.length,
      restored,
    });
  }
  return result;
};
