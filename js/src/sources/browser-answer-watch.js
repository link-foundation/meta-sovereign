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

const failure = () =>
  Object.assign(new Error('The watched provider page changed or closed.'), {
    code: 'question-watch-page-changed',
    fallback: false,
  });

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
  const pending = new Set();
  const verifyCurrent = async (verify) => {
    await verify?.();
    if (closed || changed) {
      throw Object.assign(failure(), {
        historyReason: closed ? 'cancelled' : 'document-changed',
      });
    }
  };
  const run = (work) => {
    if (closed || changed) {
      return Promise.reject(failure());
    }
    const result = queue(async () => {
      if (closed || changed) {
        throw failure();
      }
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
    read: () => run(() => readBrowserAnswerChoices(document, ui, target)),
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
            ...options,
            inactiveToken: token,
            verifyRestore: inactive,
            verifyCurrent: async () => {
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
    select: (draft, verify) =>
      run(async () => {
        await verifyCurrent(verify);
        return selectBrowserAnswer(document, ui, draft, target, {
          receiptMs,
          pollMs,
        });
      }),
    replyText: (expected, text, verify) => {
      const frozen = checkedTextReply(ui, target, expected, text);
      return run(async () => {
        await verifyCurrent(verify);
        return sendBrowserTextReply(document, ui, target, frozen, text, {
          receiptMs,
          pollMs,
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
      closing ??= (async () => {
        closed = true;
        for (const event of events) {
          page.off(event, invalidate);
        }
        await Promise.allSettled([...pending]);
        released();
      })();
      return closing;
    },
  };
};
