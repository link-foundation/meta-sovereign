import { recordOutcome } from './record-outcome.js';
import { guardedSend, outboxKey } from './outbox.js';
import { queueDrafts } from './drafts.js';
import { validateAnswerDraft } from './question-store.js';
import { questionChoiceKey } from './question-choice-key.js';
import { validatePersonalReplyDraft } from './gratitude-store.js';
import { deliverOrderedReply } from './ordered-reply.js';
import { withVkDeliveryPacing } from './vk-queued-delivery.js';
import { readVkOutgoingSettings } from './vk-outgoing-settings.js';

const indicateTyping = async (store, showTyping, automation, draft) => {
  if (
    draft.answer?.strictOptions ||
    draft.sticker ||
    (draft.source === 'vk' && (await readVkOutgoingSettings(store)).enabled)
  ) {
    return;
  }
  return showTyping(automation, draft);
};

const deliveryKey = (automation, draft, clock, queued) =>
  queued ??
  draft.sequence?.key ??
  questionChoiceKey(draft) ??
  outboxKey({
    owner: automation.id,
    source: draft.source,
    chat: draft.chat,
    ...(draft.answer?.message ? { step: draft.answer.message } : {}),
    now: clock().getTime(),
  });

const outcomeFailure = (outcome) =>
  outcome.status === 'sent'
    ? {}
    : {
        error: outcome.error,
        ...(outcome.code ? { code: outcome.code } : {}),
        ...(outcome.retryAfter ? { retryAfter: outcome.retryAfter } : {}),
      };

export const createDelivery = ({
  store,
  send,
  showTyping,
  clock,
  log,
  nowIso,
  self = [],
  outgoing,
  markRead,
  setTyping,
}) => {
  /** Send one draft now: typing, the guarded send, ledger, chat history. */
  const execute = async (
    automation,
    draft,
    {
      reviewed = false,
      orderedStep = false,
      acknowledged = null,
      queueKey,
    } = {}
  ) => {
    if (typeof send !== 'function') {
      throw new Error('no sender configured; send it yourself and mark it');
    }
    if (draft.engagement && !orderedStep) {
      return deliverOrderedReply({
        store,
        automation,
        draft,
        reviewed,
        deliver,
        log,
        queue: () => queueDrafts(store, automation, [draft], nowIso()),
      });
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
    const context = await validatePersonalReplyDraft(
      store,
      automation,
      draft,
      self,
      { acknowledged }
    );
    if (!context.ok) {
      return { status: 'failed', ...context, draft };
    }
    await indicateTyping(store, showTyping, automation, draft);
    if (draft.answer) {
      const valid = await validateAnswerDraft(store, automation, draft, {
        reviewed,
        now: clock().getTime(),
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
      key: deliveryKey(automation, draft, clock, queueKey),
      draft,
      send: async (outgoing) => {
        const valid = await validatePersonalReplyDraft(
          store,
          automation,
          outgoing,
          self,
          { acknowledged }
        );
        if (!valid.ok) {
          throw Object.assign(new Error(valid.error), {
            code: valid.code,
            fallback: false,
            definitive: true,
          });
        }
        return send(outgoing);
      },
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
      ...outcomeFailure(outcome),
    };
  };
  const deliver = withVkDeliveryPacing(
    {
      store,
      outgoing,
      markRead,
      setTyping,
      self,
      clock,
      keyFor: (automation, draft) => deliveryKey(automation, draft, clock),
    },
    execute
  );
  return deliver;
};
