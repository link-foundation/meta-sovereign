import { recordOutcome } from './record-outcome.js';
import { guardedSend, outboxKey } from './outbox.js';
import { queueDrafts } from './drafts.js';
import { validateAnswerDraft } from './question-store.js';

export const createDelivery =
  ({ store, send, showTyping, clock, log, nowIso }) =>
  /** Send one draft now: typing, the guarded send, ledger, chat history. */
  async (automation, draft, { reviewed = false } = {}) => {
    if (typeof send !== 'function') {
      throw new Error('no sender configured; send it yourself and mark it');
    }
    if (
      draft.answer &&
      !reviewed &&
      (draft.answer.requiresReview || !draft.answer.complete)
    ) {
      await queueDrafts(store, automation, [draft], nowIso());
      return {
        status: 'failed',
        code: 'answer-review-required',
        error: 'Review this answer in its chat before sending',
        draft,
      };
    }
    await showTyping(automation, draft);
    if (draft.answer) {
      const valid = await validateAnswerDraft(store, automation, draft, {
        reviewed,
      });
      if (!valid.ok) {
        log({
          event: 'automation_answer_invalidated',
          automation: automation.id,
          source: draft.source,
          chat: draft.chat,
          question: draft.answer.message,
          code: valid.code,
        });
        return { status: 'failed', ...valid, draft };
      }
    }
    const outcome = await guardedSend({
      store,
      kind: 'automation',
      owner: automation.id,
      key: outboxKey({
        owner: automation.id,
        source: draft.source,
        chat: draft.chat,
        ...(draft.answer?.message ? { step: draft.answer.message } : {}),
        now: clock().getTime(),
      }),
      draft,
      send,
      clock,
      log,
    });
    const record = await recordOutcome({
      store,
      automation,
      draft,
      outcome,
      nowIso,
      log,
    });
    return {
      status: outcome.status,
      draft,
      record,
      outbox: outcome.outbox,
      ...(outcome.status === 'sent'
        ? {}
        : {
            error: outcome.error,
            ...(outcome.code ? { code: outcome.code } : {}),
            ...(outcome.retryAfter ? { retryAfter: outcome.retryAfter } : {}),
          }),
    };
  };
