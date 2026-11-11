import { randomUUID } from 'node:crypto';
import { previewAnswer } from './question-store.js';
import { guardedSend, outboxId } from './outbox.js';
import { questionChoiceKey } from './question-choice-key.js';
import { createQuestionBrowserWatches } from './question-browser-watch.js';
import { normalizeAnswerAction } from './question-answers.js';
import { normalizeAnswerEnvironment } from './question-context.js';
import {
  browserReviewId,
  browserChoiceDraft,
  checkedBrowserChoiceReceipt,
  checkBrowserQuestion,
  browserChoiceReceipt,
  validChoiceSources,
} from './question-browser-state.js';

const PREFIX = 'question-browser:';
const LIFE_MS = 30 * 60 * 1000;
export const questionBrowserFailure = (code, message) =>
  Object.assign(new Error(message), { code, fallback: false });
const failure = questionBrowserFailure;

const targetOf = (input, sources) => {
  if (
    !sources.some((source) => source.id === input.source) ||
    typeof input.chat !== 'string' ||
    !input.chat.trim() ||
    input.chat.length > 480 ||
    (input.browserUrl !== undefined &&
      (typeof input.browserUrl !== 'string' || input.browserUrl.length > 4096))
  ) {
    throw failure(
      'question-browser-target',
      'Choose a supported provider and an explicit web-chat reference.'
    );
  }
  return {
    source: input.source,
    chat: input.chat,
    ...(input.browserUrl ? { browserUrl: input.browserUrl } : {}),
  };
};

const readRecord = async (store, input) => {
  if (!browserReviewId(input.id)) {
    throw failure(
      'question-browser-missing',
      'Read the provider question first.'
    );
  }
  const record = await store.get(input.id);
  if (!record || record.kind !== 'question-browser') {
    throw failure(
      'question-browser-missing',
      'This question review is unavailable on this server.'
    );
  }
  return record;
};

const browserCapabilities = (send) => {
  const sources =
    typeof send?.choiceSources === 'function' ? send.choiceSources() : [];
  const available =
    validChoiceSources(sources) &&
    sources.length > 0 &&
    typeof send === 'function' &&
    typeof send.readAnswerChoices === 'function' &&
    typeof send.prefillAnswer === 'function';
  const watchSources =
    available && typeof send?.openAnswerWatch === 'function'
      ? (send.answerWatchSources?.() ?? [])
      : [];
  return {
    available,
    sources: available ? sources : [],
    ...(validChoiceSources(watchSources) && watchSources.length
      ? { watchSources }
      : {}),
  };
};

const browserReviewStatus = async (store, clock, input) => {
  const record = await readRecord(store, input);
  const key = questionChoiceKey(browserChoiceDraft(record));
  const outbox = await store.get(outboxId(key));
  if (
    outbox?.status === 'sent' &&
    outbox.resolvedBy !== 'user' &&
    (!browserChoiceReceipt(
      outbox.receipt,
      browserChoiceDraft(record, outbox.receipt?.option)
    ) ||
      record.snapshot.answerOptions.filter(
        (option) => option === outbox.receipt?.option
      ).length !== 1)
  ) {
    throw failure(
      'question-browser-receipt-missing',
      'The saved selection receipt is unavailable; inspect the provider chat before resolving this outbox entry.'
    );
  }
  return globalThis.structuredClone({
    mode: 'browser-answer',
    id: record.id,
    target: record.target,
    ...record.snapshot,
    plan: record.plan,
    expiresAt: record.expiresAt,
    expired: clock().getTime() >= Date.parse(record.expiresAt),
    status: outbox?.status ?? 'review',
    outbox: outbox ?? null,
    ...(record.prefilled ? { prefilled: true } : {}),
  });
};

const freshReview = async (store, clock, input) => {
  const record = await readRecord(store, input);
  if (clock().getTime() >= Date.parse(record.expiresAt)) {
    throw failure(
      'question-browser-expired',
      'Read the current provider question again.'
    );
  }
  return record;
};

const createReviewActions = ({
  store,
  send,
  clock,
  runner,
  log,
  status,
  capabilities,
}) => ({
  status,
  async inspect(input = {}) {
    const caps = capabilities();
    if (!caps.available) {
      throw failure(
        'question-browser-unavailable',
        'Browser question controls require a connected server adapter.'
      );
    }
    const target = targetOf(input, caps.sources);
    const snapshot = checkBrowserQuestion(await send.readAnswerChoices(target));
    const planning = {
      ...normalizeAnswerAction(input),
      ...normalizeAnswerEnvironment(input),
    };
    // A validated URL may normalize the explicit web reference to its numeric ID.
    const plan = snapshot.question.outgoing
      ? null
      : await previewAnswer(
          store,
          {
            ...input,
            ...planning,
            source: target.source,
            chat: snapshot.chat,
            question: snapshot.question.body,
            options: snapshot.answerOptions,
            strictOptions: snapshot.strictOptions,
          },
          { runner }
        );
    const record = {
      id: `${PREFIX}${randomUUID()}`,
      kind: 'question-browser',
      tokens: ['question-browser', target.source, snapshot.chat],
      target,
      snapshot,
      planning,
      plan,
      expiresAt: new Date(clock().getTime() + LIFE_MS).toISOString(),
    };
    await store.put(record);
    return status(record);
  },
  async prefill(input = {}) {
    const record = await freshReview(store, clock, input);
    if (
      record.snapshot.strictOptions ||
      record.snapshot.question.outgoing ||
      !record.plan?.complete ||
      !record.plan.text?.trim()
    ) {
      throw failure(
        'question-browser-no-draft',
        'This question has no complete free-text draft to prefill.'
      );
    }
    const result = await send.prefillAnswer({
      ...record.target,
      chat: record.snapshot.chat,
      expected: record.snapshot,
      text: record.plan.text,
    });
    if (result?.prefilled !== true) {
      throw failure(
        'question-browser-prefill-unconfirmed',
        'The provider draft was not confirmed. Read the current question again.'
      );
    }
    await store.put({ ...record, prefilled: true });
    return status(record);
  },
  async select(input = {}) {
    const record = await freshReview(store, clock, input);
    if (input.confirm !== true) {
      throw failure(
        'confirm-required',
        'Review and confirm this exact provider option.'
      );
    }
    if (
      !record.snapshot.strictOptions ||
      record.snapshot.question.outgoing ||
      record.snapshot.answerOptions.filter((option) => option === input.option)
        .length !== 1
    ) {
      throw failure(
        'question-browser-option',
        'Choose one exact offered option from this review.'
      );
    }
    const draft = browserChoiceDraft(record, input.option);
    const outcome = await guardedSend({
      store,
      kind: 'question-choice',
      owner: record.id,
      key: questionChoiceKey(draft),
      draft,
      clock,
      log,
      userConfirmed: true,
      send: async (selected) =>
        checkedBrowserChoiceReceipt(await send(selected), selected),
    });
    return {
      ...(await status(record)),
      ...(outcome.code ? { code: outcome.code } : {}),
    };
  },
});

/** Shared CLI/Lino workflow. Status recovery never opens or replays the browser. */
export const createQuestionBrowser = ({
  store,
  send,
  clock = () => new Date(),
  runner,
  log = () => {},
  watchIntervalMs = 1500,
}) => {
  const capabilities = () => browserCapabilities(send);
  const status = (input) => browserReviewStatus(store, clock, input);
  const watches = createQuestionBrowserWatches({
    store,
    send,
    clock,
    log,
    intervalMs: watchIntervalMs,
  });
  const actions = {
    ...createReviewActions({
      store,
      send,
      clock,
      runner,
      log,
      status,
      capabilities,
    }),
    watchStart: watches.start,
    watchStatus: watches.status,
    watchStop: watches.stop,
  };
  let closed = false;
  const pending = new Set();
  return {
    capabilities,
    ...Object.fromEntries(
      Object.entries(actions).map(([name, action]) => [
        name,
        (...args) => {
          if (closed) {
            return Promise.reject(
              failure(
                'question-browser-closed',
                'Browser question controls are closing.'
              )
            );
          }
          const work = Promise.resolve().then(() => action(...args));
          pending.add(work);
          work.then(
            () => pending.delete(work),
            () => pending.delete(work)
          );
          return work;
        },
      ])
    ),
    async close() {
      closed = true;
      try {
        await watches.close();
      } finally {
        await Promise.allSettled([...pending]);
      }
    },
  };
};
