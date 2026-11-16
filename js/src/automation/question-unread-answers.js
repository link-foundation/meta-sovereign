import { previewAnswer } from './question-store.js';
import { guardedSend } from './outbox.js';
import { questionChoiceKey } from './question-choice-key.js';
import { approvedBrowserPlan } from './question-browser-plan.js';
import {
  browserChoiceDraft,
  checkedBrowserChoiceReceipt,
  checkBrowserQuestion,
} from './question-browser-state.js';
import { unreadFailure } from './question-unread-identity.js';

const freshPlan = (context, record, snapshot) =>
  previewAnswer(context.store, {
    ...record.planning,
    modelDraft: false,
    source: record.source,
    chat: snapshot.chat,
    question: snapshot.question.body,
    links: snapshot.question.links,
    pendingMessages: snapshot.pendingTurn?.messages,
    options: snapshot.answerOptions,
    strictOptions: snapshot.strictOptions,
  });

const select = async ({
  context,
  record,
  snapshot,
  handle,
  plan,
  verify,
  entry,
  save,
}) => {
  const draft = browserChoiceDraft(
    {
      target: { source: record.source, chat: snapshot.chat },
      snapshot,
    },
    plan.option
  );
  const key = questionChoiceKey(draft);
  entry.answer = {
    ...entry.answer,
    phase: 'selecting',
    selection: { chat: draft.chat, option: draft.text, key },
  };
  await save(record);
  const outcome = await guardedSend({
    store: context.store,
    owner: record.id,
    kind: 'question-choice',
    key,
    draft,
    clock: context.clock,
    log: context.log,
    send: async (selected) => {
      await verify();
      return checkedBrowserChoiceReceipt(
        await handle.selectInactive(selected, verify),
        selected
      );
    },
  });
  const delivered =
    outcome.status === 'sent' || outcome.code === 'already-sent';
  if (delivered && outcome.outbox?.resolvedBy !== 'user') {
    checkedBrowserChoiceReceipt(outcome.outbox?.receipt, draft);
  }
  entry.answer = {
    ...entry.answer,
    phase: delivered
      ? outcome.outbox?.resolvedBy === 'user'
        ? 'marked-sent'
        : 'sent'
      : outcome.status === 'unknown' || outcome.code === 'send-in-doubt'
        ? 'unknown'
        : 'failed',
    outbox: outcome.outbox ?? null,
    ...(delivered ? {} : { reason: outcome.code ?? 'selection-refused' }),
  };
  await save(record);
  return delivered;
};

/** Ordinary text is held for owner review; only approved native options dispatch. */
export const visitUnreadAnswer = async ({
  context,
  record,
  controller,
  observation,
  handle,
  review,
  save,
}) => {
  const snapshot = checkBrowserQuestion(handle.snapshot);
  if (snapshot.chat !== observation.chat) {
    throw unreadFailure(
      'question-unread-unverified',
      'The borrowed conversation changed.'
    );
  }
  const reviewed = await review(
    { source: record.source, chat: snapshot.chat },
    snapshot,
    record.planning
  );
  const plan = reviewed.plan;
  const entry = {
    chat: snapshot.chat,
    reviewId: reviewed.id,
    preview: snapshot.question.body.slice(0, 600),
    answer: { phase: 'review', questionId: snapshot.question.id },
  };
  record.entries.push(entry);
  await save(record);
  if (
    snapshot.question.outgoing ||
    snapshot.noticeContext?.canReply === false ||
    (plan?.noReply && !plan.linkReview && !plan.pending?.blocked)
  ) {
    entry.answer.phase = 'no-reply';
    await save(record);
    return { holdReview: false };
  }
  const verify = async () => {
    if (
      controller.signal.aborted ||
      JSON.stringify(await freshPlan(context, record, snapshot)) !==
        JSON.stringify(plan)
    ) {
      throw unreadFailure(
        'question-watch-plan-changed',
        'The saved answer or policy changed.'
      );
    }
  };
  if (snapshot.strictOptions && approvedBrowserPlan(plan) && plan.option) {
    if (
      await select({
        context,
        record,
        snapshot,
        handle,
        plan,
        verify,
        entry,
        save,
      })
    ) {
      return { holdReview: false };
    }
  } else if (snapshot.strictOptions && !snapshot.answerOptions.length) {
    entry.answer.phase = 'pending-options';
  }
  // Claim the held view before writing. Even a lost prefill response must not
  // navigate over a newly prepared draft or visit another conversation.
  await handle.holdReviewInactive();
  if (
    !snapshot.strictOptions &&
    !snapshot.hasDraft &&
    plan?.complete &&
    !plan.linkReview &&
    !plan.pending?.blocked &&
    plan.text?.trim()
  ) {
    const result = await handle.prefillInactive(snapshot, plan.text, verify);
    if (result?.prefilled !== true) {
      throw unreadFailure(
        'question-browser-prefill-unconfirmed',
        'The review draft was not confirmed.'
      );
    }
    entry.answer.phase = 'prefilled';
  } else if (snapshot.hasDraft && !snapshot.strictOptions) {
    entry.answer.phase = 'owner-draft';
  }
  await save(record);
  return { holdReview: true };
};
