import { withBrowserChatNavigation } from './browser-chat-navigation.js';
import { scanBrowserConversation } from './browser-conversation-history.js';
import { readBrowserAnswerChoices } from './browser-choices.js';
import { normalizeChatScanOptions } from './browser-scan-options.js';

export const normalizeUnreadScanOptions = (options = {}) => {
  const settings = normalizeChatScanOptions(options);
  const maxChats = options.maxChats ?? 20;
  if (
    !Number.isInteger(maxChats) ||
    maxChats < 1 ||
    maxChats > 100 ||
    options.unreadOnly === false
  ) {
    throw Object.assign(new Error('An unread scan requires one to 100 chats'), {
      code: 'bad-chat-scan',
      fallback: false,
    });
  }
  return { ...settings, maxChats };
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
        if (
          options.signal?.aborted ||
          globalThis.performance.now() >= deadline ||
          conversations.length >= settings.maxChats
        ) {
          reason = options.signal?.aborted
            ? 'cancelled'
            : globalThis.performance.now() >= deadline
              ? 'time-limit'
              : 'chat-limit';
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
              }
            );
            await verify();
            const question = options.signal?.aborted
              ? null
              : await readBrowserAnswerChoices(chatDocument, ui, chat, {
                  preserveDraft: true,
                });
            return { ...row, history, question };
          }
        );
        if (!observation) {
          reason = 'time-limit';
          break;
        }
        conversations.push(observation);
        if (options.signal?.aborted) {
          reason = 'cancelled';
          break;
        }
        if (globalThis.performance.now() >= deadline) {
          reason = 'time-limit';
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
