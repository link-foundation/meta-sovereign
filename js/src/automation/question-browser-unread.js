import { archiveBrowserHistoryWindow } from '../sources/browser-history-archive.js';
import { normalizeUnreadScanOptions } from '../sources/browser-unread-conversations.js';
import { normalizeAnswerAction } from './question-answers.js';
import { normalizeAnswerEnvironment } from './question-context.js';
import {
  checkBrowserQuestion,
  boundedBrowserText,
} from './question-browser-state.js';
import {
  browserUnreadId,
  unreadFailure,
  validUnreadCoverage,
  validUnreadRestoration,
  validUnreadReplyView,
} from './question-unread-state.js';
import { visitUnreadNotice } from './question-unread-notices.js';
import { visitUnreadAnswer } from './question-unread-answers.js';
import { validUnreadForm } from './question-unread-form.js';
import {
  unreadAnswerStatus,
  validUnreadAnswer,
} from './question-unread-answer-state.js';
import {
  unreadNoticeStatus,
  validUnreadNotice,
} from './question-unread-notice-state.js';

const failure = unreadFailure;
const checkedPass = (value, { maxChats, watchWaiting }) => {
  if (
    !validUnreadCoverage(value?.coverage, watchWaiting) ||
    !validUnreadRestoration(value.restoration) ||
    !Array.isArray(value.conversations) ||
    value.conversations.length > maxChats ||
    value.conversations.length !== value.coverage.visited ||
    value.conversations.some(
      (entry) => !boundedBrowserText(entry?.chat, 480)
    ) ||
    new Set(value.conversations.map((entry) => entry.chat)).size !==
      value.conversations.length
  ) {
    throw failure(
      'question-unread-unverified',
      'The unread pass receipt was not verified.'
    );
  }
  return value;
};

const reviewEntry = async (entry, record, review) => {
  try {
    const snapshot = checkBrowserQuestion(entry.question);
    if (snapshot.chat !== entry.chat) {
      throw failure(
        'question-browser-unverified',
        'The observed chat changed.'
      );
    }
    const result = await review(
      { source: record.source, chat: entry.chat },
      entry.question,
      record.planning
    );
    return {
      chat: entry.chat,
      reviewId: result.id,
      preview: snapshot.question.body.slice(0, 600),
    };
  } catch (error) {
    return {
      chat: entry.chat,
      code: boundedBrowserText(error.code, 120)
        ? error.code
        : 'question-unread-review-failed',
    };
  }
};

const executeUnreadReview = async ({
  record,
  controller,
  send,
  review,
  save,
  context,
  watch,
}) => {
  let recentWindow;
  try {
    const pass = checkedPass(
      await send.scanUnreadConversations({
        source: record.source,
        ...record.settings,
        ...(record.heldChat ? { heldChat: record.heldChat } : {}),
        ...(watch ? { checkedChats: [...watch.checked] } : {}),
        signal: controller.signal,
        onHistoryWindow: async (window) => {
          const captured = await archiveBrowserHistoryWindow(context.store, {
            ...window,
            source: record.source,
            signal: controller.signal,
          });
          recentWindow = globalThis.structuredClone({
            chat: window.chat,
            rows: window.rows.slice(-21),
          });
          const previous = record.archive ?? {
            windows: 0,
            observations: 0,
            changed: 0,
          };
          record.archive = {
            windows: previous.windows + 1,
            observations: previous.observations + captured.observed,
            changed: previous.changed + captured.changed,
          };
          await save(record);
        },
        ...(record.answerChats
          ? {
              onConversation: (observation, handle) =>
                visitUnreadAnswer({
                  context: { ...context, recentWindow: () => recentWindow },
                  record,
                  controller,
                  observation,
                  handle,
                  review,
                  save,
                  watch,
                }),
            }
          : record.noticeReplies
            ? {
                onConversation: (observation, handle) =>
                  visitUnreadNotice({
                    context,
                    record,
                    controller,
                    observation,
                    handle,
                    reviewEntry: (entry, current) =>
                      reviewEntry(entry, current, review),
                    save,
                  }),
              }
            : {}),
      }),
      record.settings
    );
    if (!validUnreadReplyView({ ...record, restoration: pass.restoration })) {
      throw failure(
        'question-unread-unverified',
        'The revealed reply was not confirmed.'
      );
    }
    record.coverage = pass.coverage;
    record.restoration = pass.restoration;
    for (const entry of record.noticeReplies || record.answerChats
      ? []
      : pass.conversations) {
      if (controller.signal.aborted) {
        break;
      }
      record.entries.push(await reviewEntry(entry, record, review));
      await save(record);
    }
    if (
      !controller.signal.aborted &&
      record.entries.length !== pass.conversations.length
    ) {
      throw failure(
        'question-unread-unverified',
        'The unread visitor did not confirm every chat.'
      );
    }
    record.state = controller.signal.aborted
      ? 'stopped'
      : record.entries.some((entry) =>
            ['failed', 'unknown'].includes(entry.answer?.phase)
          )
        ? 'paused'
        : 'completed';
  } catch (error) {
    if (process.env.MS_QUESTION_UNREAD_DEBUG === '1') {
      console.error('[question-unread-review]', { id: record.id, error });
    }
    record.state = controller.signal.aborted
      ? 'stopped'
      : error.code === 'question-unread-notice-paused'
        ? 'paused'
        : 'failed';
    record.code = boundedBrowserText(error.code, 120)
      ? error.code
      : 'question-unread-failed';
    if (validUnreadRestoration(error.restoration)) {
      record.restoration = error.restoration;
    }
  } finally {
    await save(record);
  }
};

export const normalizeUnreadReviewSettings = (input, capabilities) => {
  if (!capabilities.unreadSources?.some(({ id }) => id === input.source)) {
    throw failure(
      'question-unread-unavailable',
      'Unread browser traversal is unavailable for this provider.'
    );
  }
  if (
    (input.watchWaiting !== undefined &&
      typeof input.watchWaiting !== 'boolean') ||
    (input.watchWaiting &&
      (input.source !== 'hh' ||
        input.answerChats !== true ||
        input.reviewChoices !== true))
  ) {
    throw failure(
      'question-unread-waiting-unavailable',
      'Waiting chat watch requires supervised HeadHunter answers and manual bot choices.'
    );
  }
  if (
    (input.answerChats !== undefined &&
      typeof input.answerChats !== 'boolean') ||
    (input.answerChats &&
      !capabilities.unreadAnswerSources?.some(
        ({ id }) => id === input.source
      )) ||
    (input.answerChats && input.noticeReplies) ||
    (input.reviewChoices !== undefined &&
      typeof input.reviewChoices !== 'boolean') ||
    (input.reviewChoices && !input.answerChats) ||
    (input.heldChat && !input.answerChats)
  ) {
    throw failure(
      'question-unread-answers-unavailable',
      'Sequential answers require an explicitly supported provider and separate notice controls.'
    );
  }
  if (
    (input.noticeReplies !== undefined &&
      typeof input.noticeReplies !== 'boolean') ||
    (input.noticeReplies &&
      !capabilities.unreadNoticeSources?.some(({ id }) => id === input.source))
  ) {
    throw failure(
      'question-unread-notices-unavailable',
      'Notice replies require an explicitly supported unread provider.'
    );
  }
  if (
    (input.prefillForms !== undefined &&
      typeof input.prefillForms !== 'boolean') ||
    (input.prefillForms &&
      (!input.answerChats ||
        !capabilities.unreadFormSources?.some(({ id }) => id === input.source)))
  ) {
    throw failure(
      'question-unread-forms-unavailable',
      'Questionnaire prefill requires sequential answers and an available Forms owner.'
    );
  }
  // A linked review can open a second browser and still needs to leave time
  // to observe the next native conversation. Preserve an explicit caller cap.
  return normalizeUnreadScanOptions({
    ...input,
    budgetMs: input.budgetMs ?? (input.prefillForms ? 60000 : undefined),
  });
};

const unreadStatusResult = (record, owned) => {
  const {
    kind: _kind,
    tokens: _tokens,
    planning: _planning,
    ...result
  } = record;
  return globalThis.structuredClone({
    ...result,
    mode: 'browser-unread-review',
    owned,
  });
};

/** Finite existing-view reads; durable IDs recover status without replaying mark-read actions. */
export const createQuestionUnreadReviews = ({
  store,
  send,
  clock,
  capabilities,
  review,
  log = () => {},
  answerPlanning,
  prefillLinkedForm,
}) => {
  const runtimes = new Map();
  let admitting = Promise.resolve();
  let closed = false;
  const context = { store, clock, log, answerPlanning, prefillLinkedForm };
  const save = async (record) => {
    record.updatedAt = clock().toISOString();
    await store.put(record);
    await store.flush?.();
  };
  const read = async (input) => {
    const record = browserUnreadId(input?.id) && (await store.get(input.id));
    if (!record || record.kind !== 'question-unread') {
      throw failure(
        'question-unread-missing',
        'This unread review pass is unavailable on this server.'
      );
    }
    return record;
  };
  const status = async (input) => {
    const record = globalThis.structuredClone(await read(input));
    if (record.state === 'active' && !runtimes.has(record.id)) {
      record.state = 'paused';
      record.code = 'question-unread-owner-unavailable';
    }
    record.entries = await Promise.all(
      record.entries.map(async (entry) =>
        unreadAnswerStatus(store, await unreadNoticeStatus(store, entry))
      )
    );
    if (
      record.entries.some(
        (entry) =>
          (entry.notice &&
            !validUnreadNotice(entry.notice, record.source, entry.chat)) ||
          (entry.answer &&
            !validUnreadAnswer(entry.answer, record.source, entry.chat)) ||
          (entry.form && !validUnreadForm(entry.form))
      )
    ) {
      throw failure(
        'question-browser-receipt-missing',
        'The unread reply receipt was not verified.'
      );
    }
    return unreadStatusResult(record, runtimes.has(record.id));
  };
  const admit = async (input, { watch } = {}) => {
    if (closed) {
      throw failure(
        'question-unread-closed',
        'Unread review controls are closing.'
      );
    }
    if (!browserUnreadId(input.id) || input.confirm !== true) {
      throw failure(
        'confirm-required',
        'Confirm that opening unread chats may mark messages read and supply a new pass ID.'
      );
    }
    if (await store.get(input.id)) {
      return status(input);
    }
    if (input.watchWaiting && !watch) {
      throw failure(
        'question-unread-waiting-unavailable',
        'Waiting chat watch requires repeated polling.'
      );
    }
    const settings = normalizeUnreadReviewSettings(input, capabilities());
    const planning = {
      ...normalizeAnswerAction(input),
      ...normalizeAnswerEnvironment(input),
      modelDraft: input.answerChats === true && input.modelDraft === true,
    };
    if (
      [...runtimes.values()].some((runtime) => runtime.source === input.source)
    ) {
      throw failure(
        'question-unread-active',
        'An unread review pass already owns this provider.'
      );
    }
    const record = {
      id: input.id,
      kind: 'question-unread',
      tokens: ['question-unread', input.source],
      source: input.source,
      settings,
      planning,
      ...(input.noticeReplies ? { noticeReplies: true } : {}),
      ...(input.answerChats ? { answerChats: true } : {}),
      ...(input.reviewChoices ? { reviewChoices: true } : {}),
      ...(settings.watchWaiting ? { watchWaiting: true } : {}),
      ...(input.prefillForms ? { prefillForms: true } : {}),
      ...(input.heldChat ? { heldChat: input.heldChat } : {}),
      state: 'active',
      startedAt: clock().toISOString(),
      entries: [],
      coverage: null,
      restoration: null,
    };
    const controller = new AbortController();
    const runtime = { source: record.source, controller };
    runtimes.set(record.id, runtime);
    try {
      await save(record);
    } catch (error) {
      runtimes.delete(record.id);
      throw error;
    }
    if (closed) {
      controller.abort();
    }
    runtime.work = executeUnreadReview({
      record,
      controller,
      send,
      review,
      save,
      context,
      watch,
    }).finally(() => runtimes.delete(record.id));
    runtime.work.catch(() => {});
    return status(record);
  };
  return {
    start(input = {}, internal) {
      const work = admitting.then(() => admit(input, internal));
      admitting = work.catch(() => {});
      return work;
    },
    status,
    async stop(input) {
      await admitting;
      await read(input);
      const runtime = runtimes.get(input.id);
      runtime?.controller.abort();
      await runtime?.work;
      return status(input);
    },
    async close() {
      closed = true;
      await admitting;
      const active = [...runtimes.values()];
      for (const runtime of active) {
        runtime.controller.abort();
      }
      await Promise.allSettled(active.map((runtime) => runtime.work));
    },
  };
};
