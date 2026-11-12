import { withBrowserChatNavigation } from './browser-chat-navigation.js';
import { scanBrowserConversation } from './browser-conversation-history.js';
import { readBrowserAnswerChoices } from './browser-choices.js';
import { normalizeChatScanOptions } from './browser-scan-options.js';
import { withBrowserConversationTail } from './browser-conversation-tail.js';

export const normalizeUnreadScanOptions = (options = {}) => {
  const settings = normalizeChatScanOptions(options);
  const maxChats = options.maxChats ?? 20;
  if (
    !Number.isInteger(maxChats) ||
    maxChats < 1 ||
    maxChats > 100 ||
    options.unreadOnly === false ||
    (options.onConversation !== undefined &&
      typeof options.onConversation !== 'function')
  ) {
    throw Object.assign(new Error('An unread scan requires one to 100 chats'), {
      code: 'bad-chat-scan',
      fallback: false,
    });
  }
  return { ...settings, maxChats };
};

const passStopReason = (signal, deadline, limitReached = false) => {
  if (signal?.aborted) {
    return 'cancelled';
  }
  if (globalThis.performance.now() >= deadline) {
    return 'time-limit';
  }
  return limitReached ? 'chat-limit' : null;
};

/** One finite read pass in an existing inactive view; opening may mark chats read. */
export const scanUnreadBrowserConversations = ({
  commander,
  page,
  ui,
  scanList,
  ...options
}) => {
  const settings = normalizeUnreadScanOptions(options);
  const deadline = globalThis.performance.now() + settings.budgetMs;
  return withBrowserChatNavigation(
    { commander, page, ui, signal: options.signal, waitMs: settings.waitMs },
    async ({ document, visit, verifyCurrent, inactiveToken }) => {
      const list = await scanList(document, ui, {
        ...options,
        ...settings,
        unreadOnly: true,
        verifyCurrent,
        inactiveToken,
      });
      if (process.env.MS_BROWSER_CHAT_VIEW_DEBUG === '1') {
        console.error('[browser-unread-list]', {
          elapsedMs:
            settings.budgetMs - (deadline - globalThis.performance.now()),
          coverage: list.coverage,
        });
      }
      const conversations = [];
      let reason = list.coverage.endObserved
        ? 'observed-list'
        : list.coverage.reason;
      for (const row of list.rows) {
        const stop = passStopReason(
          options.signal,
          deadline,
          conversations.length >= settings.maxChats
        );
        if (stop) {
          reason = stop;
          break;
        }
        await verifyCurrent();
        const observation = await visit(
          row.chat,
          async (chatDocument, chat, verify, token) => {
            const remaining = Math.floor(
              deadline - globalThis.performance.now()
            );
            if (remaining < 100) {
              return null;
            }
            let question = null;
            const history = await scanBrowserConversation(
              chatDocument,
              ui,
              chat,
              {
                ...settings,
                signal: options.signal,
                budgetMs: remaining,
                inactiveToken: token,
                verifyCurrent: verify,
                verifyRestore: verify,
              },
              {
                readNewest: async () => {
                  await verify();
                  question = await readBrowserAnswerChoices(
                    chatDocument,
                    ui,
                    chat,
                    {
                      preserveDraft: true,
                    }
                  );
                  await verify();
                },
              }
            );
            await verify();
            const observation = {
              ...row,
              history,
              question: options.signal?.aborted ? null : question,
            };
            if (options.onConversation && !options.signal?.aborted) {
              const processed = await withBrowserConversationTail(
                {
                  document: chatDocument,
                  ui,
                  chat,
                  settings: {
                    ...settings,
                    budgetMs: Math.max(
                      0,
                      deadline - globalThis.performance.now()
                    ),
                  },
                  signal: options.signal,
                  token,
                  verify,
                },
                (handle) => options.onConversation(observation, handle)
              );
              observation.processing = processed;
            }
            return observation;
          }
        );
        if (!observation) {
          reason = 'time-limit';
          break;
        }
        conversations.push(observation);
        if (observation.processing?.restored === false) {
          reason = 'visit-restoration-failed';
          break;
        }
        const stopped = passStopReason(options.signal, deadline);
        if (stopped) {
          reason = stopped;
          break;
        }
      }
      return {
        list,
        conversations,
        coverage: {
          complete: false,
          scope: 'unread-conversations',
          reason,
          observed: list.rows.length,
          visited: conversations.length,
        },
      };
    }
  );
};
