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
import {
  unreadNoticeStatus,
  validUnreadNotice,
} from './question-unread-notice-state.js';

const failure = unreadFailure;
const checkedPass = (value, maxChats) => {
  if (
    !validUnreadCoverage(value?.coverage) ||
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
      snapshot,
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
}) => {
  try {
    const pass = checkedPass(
      await send.scanUnreadConversations({
        source: record.source,
        ...record.settings,
        signal: controller.signal,
        ...(record.noticeReplies
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
      record.settings.maxChats
    );
    if (!validUnreadReplyView({ ...record, restoration: pass.restoration })) {
      throw failure(
        'question-unread-unverified',
        'The revealed reply was not confirmed.'
      );
    }
    record.coverage = pass.coverage;
    record.restoration = pass.restoration;
    for (const entry of record.noticeReplies ? [] : pass.conversations) {
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
    record.state = controller.signal.aborted ? 'stopped' : 'completed';
  } catch (error) {
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
  const settings = normalizeUnreadScanOptions(input);
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
  return settings;
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
}) => {
  const runtimes = new Map();
  let admitting = Promise.resolve();
  let closed = false;
  const context = { store, clock, log };
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
      record.entries.map((entry) => unreadNoticeStatus(store, entry))
    );
    if (
      record.entries.some(
        (entry) =>
          entry.notice &&
          !validUnreadNotice(entry.notice, record.source, entry.chat)
      )
    ) {
      throw failure(
        'question-browser-receipt-missing',
        'The unread notice receipt was not verified.'
      );
    }
    return unreadStatusResult(record, runtimes.has(record.id));
  };
  const admit = async (input) => {
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
    const settings = normalizeUnreadReviewSettings(input, capabilities());
    const planning = {
      ...normalizeAnswerAction(input),
      ...normalizeAnswerEnvironment(input),
      modelDraft: false,
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
    }).finally(() => runtimes.delete(record.id));
    runtime.work.catch(() => {});
    return status(record);
  };
  return {
    start(input = {}) {
      const work = admitting.then(() => admit(input));
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
