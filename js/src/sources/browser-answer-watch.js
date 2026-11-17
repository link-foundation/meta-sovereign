import { resolveBrowserChoiceDocument } from './browser-choice-document.js';
import {
  readBrowserAnswerChoices,
  prefillBrowserAnswer,
  selectBrowserAnswer,
} from './browser-choices.js';
import {
  checkedTextReply,
  sendBrowserTextReply,
  sendInactiveBrowserTextReply,
} from './browser-text-reply.js';
import { withInactiveBrowserView } from './browser-inactive-view.js';
import { scanBrowserConversation } from './browser-conversation-history.js';
import { normalizeChatScanOptions } from './browser-scan-options.js';
import { openBrowserHistoryCapture } from './browser-history-capture.js';

const failure = () =>
  Object.assign(new Error('The watched provider page changed or closed.'), {
    code: 'question-watch-page-changed',
    fallback: false,
  });

const openWatchCapture = async (options, page, events, invalidate) => {
  try {
    return options.onHistoryWindow
      ? await openBrowserHistoryCapture(options)
      : null;
  } catch (error) {
    for (const event of events) {
      page.off(event, invalidate);
    }
    throw error;
  }
};

const releaseWatch = async ({
  page,
  events,
  invalidate,
  pending,
  capture,
  released,
}) => {
  for (const event of events) {
    page.off(event, invalidate);
  }
  try {
    await Promise.allSettled([...pending]);
    await capture?.close();
  } finally {
    released();
  }
};

/** A single owned document. Later reads/writes never reopen or navigate a chat. */
export const openBrowserAnswerWatch = async ({
  commander,
  page,
  ui,
  target,
  queue,
  receiptMs,
  pollMs,
  released,
  onHistoryWindow,
}) => {
  if (!ui.documents || !page?.on || !page?.off) {
    throw failure();
  }
  const document = await resolveBrowserChoiceDocument(
    commander,
    page,
    ui,
    target
  );
  let changed = false;
  let closed = false;
  let closing;
  const invalidate = () => {
    changed = true;
  };
  const events = ['framenavigated', 'framedetached', 'close'];
  for (const event of events) {
    page.on(event, invalidate);
  }
  const capture = await openWatchCapture(
    { document, ui, target, onHistoryWindow },
    page,
    events,
    invalidate
  );
  const pending = new Set();
  const verifyCurrent = async (verify) => {
    await verify?.();
    if (closed || changed) {
      throw Object.assign(failure(), {
        historyReason: closed ? 'cancelled' : 'document-changed',
      });
    }
    await capture?.flush();
  };
  const run = (work) => {
    if (closed || changed) {
      return Promise.reject(failure());
    }
    const result = queue(async () => {
      if (closed || changed) {
        throw failure();
      }
      await capture?.flush();
      return work();
    });
    pending.add(result);
    result.then(
      () => pending.delete(result),
      () => pending.delete(result)
    );
    return result;
  };
  return {
    read: (options) =>
      run(() => readBrowserAnswerChoices(document, ui, target, options)),
    readInactiveQuestion: () =>
      run(() =>
        withInactiveBrowserView(document, () =>
          readBrowserAnswerChoices(document, ui, target, {
            preserveDraft: true,
          })
        )
      ),
    readInactiveHistory: (options = {}) => {
      normalizeChatScanOptions(options);
      if (!ui.historyScan) {
        throw Object.assign(new Error('Conversation history is unavailable.'), {
          code: 'unsupported-action',
          fallback: false,
        });
      }
      return run(() =>
        withInactiveBrowserView(document, async (inactive, token) =>
          scanBrowserConversation(document, ui, target, {
            ...(onHistoryWindow
              ? { onHistoryWindow: capture.writeWindow }
              : {}),
            ...options,
            inactiveToken: token,
            verifyRestore: inactive,
            verifyCurrent: async () => {
              await options.verifyCurrent?.();
              await verifyCurrent();
              await inactive();
            },
          })
        )
      );
    },
    prefill: (expected, text, verify) =>
      run(async () => {
        await verifyCurrent(verify);
        return prefillBrowserAnswer(document, ui, expected, text);
      }),
    select: (draft, verify, recent) =>
      run(async () => {
        await verifyCurrent(verify);
        return selectBrowserAnswer(document, ui, draft, target, {
          receiptMs,
          pollMs,
          recent,
          verifyCurrent: () => verifyCurrent(verify),
        });
      }),
    replyText: (expected, text, verify) => {
      const frozen = checkedTextReply(ui, target, expected, text);
      return run(async () => {
        await verifyCurrent(verify);
        return sendBrowserTextReply(document, ui, target, frozen, text, {
          receiptMs,
          pollMs,
          verifyCurrent: () => verifyCurrent(verify),
        });
      });
    },
    replyTextInactive: (expected, text, verify) => {
      const frozen = checkedTextReply(ui, target, expected, text);
      return run(() =>
        sendInactiveBrowserTextReply(document, ui, target, frozen, text, {
          receiptMs,
          pollMs,
          verifyCurrent: () => verifyCurrent(verify),
        })
      );
    },
    close() {
      closed = true;
      closing ??= releaseWatch({
        page,
        events,
        invalidate,
        pending,
        capture,
        released,
      });
      return closing;
    },
  };
};
