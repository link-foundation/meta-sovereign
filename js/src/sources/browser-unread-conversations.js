import { withBrowserChatNavigation } from './browser-chat-navigation.js';
import { scanBrowserConversation } from './browser-conversation-history.js';
import { readBrowserAnswerChoices } from './browser-choices.js';
import { normalizeChatScanOptions } from './browser-scan-options.js';
import { withBrowserConversationTail } from './browser-conversation-tail.js';
import { boundedBrowserText } from '../automation/question-browser-state.js';
import { seedEmployerRating } from '../forms/employer-rating.js';
import { unreadCoverageScope } from '../automation/question-unread-identity.js';
import { passiveRejection } from '../automation/question-notice-intent.js';

const validSelectedCheck = (options) =>
  options.acceptSelected === undefined ||
  (typeof options.acceptSelected === 'function' &&
    typeof options.onConversation === 'function' &&
    !options.watchWaiting &&
    options.heldChat === undefined);

export const normalizeUnreadScanOptions = (options = {}) => {
  const settings = normalizeChatScanOptions(options);
  const maxChats = options.maxChats ?? 20;
  if (
    !Number.isInteger(maxChats) ||
    maxChats < 1 ||
    maxChats > 100 ||
    options.unreadOnly === false ||
    (options.watchWaiting !== undefined &&
      typeof options.watchWaiting !== 'boolean') ||
    (options.rejectionsFirst !== undefined &&
      typeof options.rejectionsFirst !== 'boolean') ||
    (options.heldChat !== undefined &&
      !boundedBrowserText(options.heldChat, 480)) ||
    (options.onConversation !== undefined &&
      typeof options.onConversation !== 'function') ||
    !validSelectedCheck(options)
  ) {
    throw Object.assign(new Error('An unread scan requires one to 100 chats'), {
      code: 'bad-chat-scan',
      fallback: false,
    });
  }
  return {
    ...settings,
    maxChats,
    ...(options.watchWaiting && { watchWaiting: true }),
    ...(options.rejectionsFirst && { rejectionsFirst: true }),
  };
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

const waitingRows = (rows, checkedChats = []) => {
  const visible = rows.filter((row) => row.lastOutgoing !== true);
  const byChat = new Map(visible.map((row) => [row.chat, row]));
  const checked = checkedChats.map((chat) => byChat.get(chat)).filter(Boolean);
  for (const row of checked) {
    byChat.delete(row.chat);
  }
  return [...byChat.values(), ...checked];
};

const rejectionPreview = ({ unread, lastOutgoing, preview }) =>
  unread > 0 &&
  lastOutgoing === false &&
  typeof preview === 'string' &&
  !/^(?:Вы|You)\s*:/iu.test(preview) &&
  !/(?:…|\.{3})$/u.test(preview) &&
  (/^(?:Отказ|Rejection)$/iu.test(preview) ||
    passiveRejection({ body: preview }));

const processingStopReason = ({ processing }) => {
  if (processing?.value?.holdReview) {
    return 'review-held';
  }
  return processing?.restored === false ? 'visit-restoration-failed' : null;
};

const eligibleHistory = (question, history) =>
  question && history.coverage.complete && history.restored;

const shouldVisitSelected = (chat, options, deadline) =>
  Boolean(chat && options.acceptSelected) &&
  !passStopReason(options.signal, deadline);

const readUnreadConversation = async ({
  chatDocument,
  chat,
  verify,
  token,
  row,
  accept,
  deadline,
  options,
  settings,
  ui,
  page,
  retainReply,
  retainReview,
}) => {
  const remaining = Math.floor(deadline - globalThis.performance.now());
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
      onHistoryWindow: options.onHistoryWindow,
    },
    {
      readNewest: async () => {
        await verify();
        question = await readBrowserAnswerChoices(chatDocument, ui, chat, {
          preserveDraft: true,
        });
        await verify();
        if (accept) {
          return accept(question);
        }
      },
    }
  );
  if (history.coverage.reason === 'history-save-failed') {
    throw Object.assign(new Error('Conversation history could not be saved.'), {
      code: 'question-history-save-failed',
      fallback: false,
    });
  }
  await verify();
  if (
    accept &&
    (options.signal?.aborted ||
      !eligibleHistory(question, history) ||
      !(await accept(question, history)))
  ) {
    return null;
  }
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
          budgetMs: Math.max(0, deadline - globalThis.performance.now()),
        },
        signal: options.signal,
        token,
        verify,
        retainReply,
        retainReview,
        ...(ui.id === 'hh' && {
          seedRating: (destination, check) =>
            seedEmployerRating(page, destination, check),
        }),
        onHistoryWindow: options.onHistoryWindow,
      },
      (handle) => options.onConversation(observation, handle)
    );
    observation.processing = processed;
  }
  return observation;
};

const listForPass = (
  { options, settings, deadline, selected, scanList },
  document,
  ui,
  verifyCurrent,
  inactiveToken
) => {
  const remaining = Math.floor(deadline - globalThis.performance.now());
  const stopped =
    (selected && processingStopReason(selected)) ??
    passStopReason(
      options.signal,
      deadline,
      Boolean(selected) && settings.maxChats === 1
    ) ??
    (remaining < 100 ? 'time-limit' : null);
  if (stopped) {
    return { rows: [], coverage: { endObserved: false, reason: stopped } };
  }
  if (options.heldChat) {
    return {
      rows: [{ chat: options.heldChat }],
      coverage: { endObserved: false, reason: 'held-chat' },
    };
  }
  return scanList(document, ui, {
    ...options,
    ...settings,
    budgetMs: remaining,
    unreadOnly: settings.watchWaiting ? undefined : true,
    verifyCurrent,
    inactiveToken,
  });
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
    {
      commander,
      page,
      ui,
      signal: options.signal,
      waitMs: settings.waitMs,
      showAllChats: settings.watchWaiting && !options.heldChat,
    },
    async ({
      document,
      selectedChat,
      visit,
      verifyCurrent,
      inactiveToken,
      retainReply,
      retainReview,
    }) => {
      const visitRow = async (row, { accept, rejectionCandidate } = {}) => {
        await verifyCurrent();
        if (options.heldChat) {
          // A held review is checked in place without scanning the list.
          await readBrowserAnswerChoices(document, ui, options.heldChat, {
            preserveDraft: true,
          });
        }
        return visit(
          row.chat,
          (chatDocument, chat, verify, token) =>
            readUnreadConversation({
              chatDocument,
              chat,
              verify,
              token,
              row: rejectionCandidate ? { ...row, rejectionCandidate } : row,
              accept,
              deadline,
              options,
              settings,
              ui,
              page,
              retainReply,
              retainReview,
            }),
          rejectionCandidate ? row.preview : undefined
        );
      };
      const selected = shouldVisitSelected(selectedChat, options, deadline)
        ? await visitRow(
            { chat: selectedChat },
            { accept: options.acceptSelected }
          )
        : null;
      const conversations = selected ? [selected] : [];
      const list = await listForPass(
        { options, settings, deadline, selected, scanList },
        document,
        ui,
        verifyCurrent,
        inactiveToken
      );
      if (process.env.MS_BROWSER_CHAT_VIEW_DEBUG === '1') {
        console.error('[browser-unread-list]', {
          elapsedMs:
            settings.budgetMs - (deadline - globalThis.performance.now()),
          coverage: list.coverage,
        });
      }
      let reason = list.coverage.endObserved
        ? 'observed-list'
        : list.coverage.reason;
      const rows = settings.watchWaiting
        ? waitingRows(list.rows, options.checkedChats)
        : list.rows;
      const priority = settings.rejectionsFirst
        ? rows.filter(rejectionPreview)
        : [];
      const visited = new Set(selected ? [selected.chat] : []);
      for (const [index, row] of [...priority, ...rows].entries()) {
        if (visited.has(row.chat)) {
          continue;
        }
        const stop = passStopReason(
          options.signal,
          deadline,
          conversations.length >= settings.maxChats
        );
        if (stop) {
          reason = stop;
          break;
        }
        const observation = await visitRow(row, {
          rejectionCandidate: index < priority.length,
        });
        if (observation === undefined) {
          // The native preview changed before opening. Keep its list order.
          continue;
        }
        if (!observation) {
          reason = 'time-limit';
          break;
        }
        visited.add(row.chat);
        conversations.push(observation);
        const stopped =
          processingStopReason(observation) ??
          passStopReason(options.signal, deadline);
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
          scope: unreadCoverageScope(settings.watchWaiting, Boolean(selected)),
          reason,
          observed:
            list.rows.length +
            Number(
              Boolean(selected) &&
                !list.rows.some(({ chat }) => chat === selected.chat)
            ),
          visited: conversations.length,
        },
      };
    }
  );
};
