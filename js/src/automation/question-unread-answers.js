import { isDeepStrictEqual } from 'node:util';
import { previewAnswer } from './question-store.js';
import { guardedSend } from './outbox.js';
import { questionChoiceKey } from './question-choice-key.js';
import { approvedBrowserPlan } from './question-browser-plan.js';
import {
  automaticBrowserReplyAllowed,
  isBrowserReuseOffer,
  planBrowserReuse,
} from './question-browser-reuse.js';
import {
  browserChoiceDraft,
  checkedBrowserChoiceReceipt,
  checkBrowserQuestion,
} from './question-browser-state.js';
import { unreadFailure } from './question-unread-identity.js';
import {
  unreadFormHandoff,
  unreadFormLink,
  visitUnreadForm,
} from './question-unread-form.js';
import { completedAnswerSummary } from './question-summary.js';
import { verifiedPassiveRejection } from './question-notice-plan.js';
import { learnUnreadSummary } from './question-unread-summary.js';
import { unreadHistoryAnswerReceipt } from './question-unread-history-learning.js';
import {
  unreadAnswerInput,
  mayDraftUnreadAnswer,
  sameUnreadAnswer,
} from './question-unread-model.js';

const select = async ({
  context,
  record,
  snapshot,
  handle,
  plan,
  verify,
  entry,
  save,
  recent,
  checkReuse,
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
    selection: {
      chat: draft.chat,
      option: draft.text,
      key,
      ...(checkReuse ? { kind: 'answer-reuse' } : {}),
    },
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
        await handle.selectInactive(
          selected,
          verify,
          recent,
          checkReuse
            ? {
                requireEmpty: true,
                noticeContext: snapshot.noticeContext,
                beforeClick: checkReuse,
              }
            : undefined
        ),
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

const maySelect = (snapshot, plan) =>
  snapshot.strictOptions &&
  !snapshot.hasDraft &&
  approvedBrowserPlan(plan) &&
  Boolean(plan.option);

const noReplyTurn = (plan) =>
  plan?.noReply === true && !plan.linkReview && !plan.pending?.blocked;

const alreadyHandled = (snapshot, plan) =>
  snapshot.question.outgoing ||
  snapshot.noticeContext?.canReply === false ||
  (!snapshot.hasDraft && noReplyTurn(plan));

const handledSummaries = (snapshot, plan) => {
  if (snapshot.hasDraft || snapshot.question.outgoing) {
    return [];
  }
  const messages = noReplyTurn(plan)
    ? (snapshot.pendingTurn?.messages ?? [snapshot.question])
    : [snapshot.question];
  return messages.filter(({ body }) => completedAnswerSummary(body));
};

const skippedQuestion = async (watch, snapshot, handle) => {
  if (!watch || snapshot.question.outgoing) {
    return false;
  }
  const { chat, question } = snapshot;
  const asked =
    watch.skip?.chat === chat && watch.skip.questionId === question.id;
  if (!asked && watch.skipped.get(chat) !== question.id) {
    return false;
  }
  const current = checkBrowserQuestion(await handle.readInactiveQuestion());
  if (
    current.chat !== chat ||
    current.question.id !== question.id ||
    current.question.outgoing
  ) {
    throw unreadFailure(
      'question-unread-skip-changed',
      'The held question changed before Skip.'
    );
  }
  return true;
};

const finishRejection = async ({
  record,
  snapshot,
  handle,
  save,
  signal,
  historyReceipt,
}) => {
  const current = checkBrowserQuestion(await handle.readInactiveQuestion());
  const verified = isDeepStrictEqual(current, snapshot);
  signal.throwIfAborted();
  if (!verified) {
    await handle.holdReviewInactive();
  }
  record.entries.push({
    chat: snapshot.chat,
    preview: snapshot.question.body.slice(0, 600),
    answer: {
      phase: verified ? 'no-reply' : 'review',
      questionId: snapshot.question.id,
      ...historyReceipt,
      reason: verified ? 'passive-rejection' : 'question-unread-unverified',
    },
  });
  await save(record);
  return { holdReview: !verified };
};

const finishSummary = async ({
  context,
  record,
  snapshot,
  summaries,
  handle,
  input,
  signal,
  entry,
}) => {
  let count = null;
  let reason = 'question-unread-summary-unverified';
  try {
    count = await learnUnreadSummary({
      store: context.store,
      source: record.source,
      snapshot,
      summaries,
      handle,
      input,
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    reason = 'question-unread-summary-save-failed';
  }
  if (count === null) {
    await handle.holdReviewInactive();
    entry.answer.reason = reason;
    return false;
  }
  if (count > 0) {
    entry.answer.summaryAnswers = count;
  }
  return true;
};

const visitReuseOffer = async ({
  context,
  record,
  snapshot,
  observed,
  handle,
  controller,
  entry,
  input,
  save,
}) => {
  const allowed = async () =>
    context.allowAutomaticReuse?.() !== false &&
    (await automaticBrowserReplyAllowed(
      context.store,
      record.source,
      snapshot.chat,
      context.clock().getTime()
    ));
  const plan =
    record.autoReuseAnswers && (await allowed())
      ? await planBrowserReuse(context.store, input, snapshot)
      : null;
  if (plan) {
    const checkReuse = () => {
      controller.signal.throwIfAborted();
      if (context.allowAutomaticReuse?.() === false) {
        throw unreadFailure(
          'question-watch-plan-changed',
          'Automatic reuse has been paused.'
        );
      }
    };
    const verify = async () => {
      checkReuse();
      const current = await unreadAnswerInput(context, record, observed, {
        signal: controller.signal,
      });
      const next = await planBrowserReuse(context.store, current, snapshot);
      if (JSON.stringify(next) !== JSON.stringify(plan) || !(await allowed())) {
        throw unreadFailure(
          'question-watch-plan-changed',
          'The saved answer or policy changed.'
        );
      }
      checkReuse();
    };
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
        recent: observed.messages ? input.recent : undefined,
        checkReuse,
      })
    ) {
      return { holdReview: false };
    }
  } else if (record.reviewChoices && snapshot.strictOptions) {
    entry.answer.phase = 'choice-review';
  }
  await handle.holdReviewInactive();
  await save(record);
  return { holdReview: true };
};

/** Ordinary text stays in review. Review-only passes also hold native choices. */
export const visitUnreadAnswer = async ({
  context,
  record,
  controller,
  observation,
  handle,
  review,
  save,
  watch,
}) => {
  const observed = handle.snapshot;
  const snapshot = checkBrowserQuestion(observed);
  if (snapshot.chat !== observation.chat) {
    throw unreadFailure(
      'question-unread-unverified',
      'The borrowed conversation changed.'
    );
  }
  if (await skippedQuestion(watch, snapshot, handle)) {
    controller.signal.throwIfAborted();
    record.entries.push({
      chat: snapshot.chat,
      preview: snapshot.question.body.slice(0, 600),
      answer: { phase: 'skipped', questionId: snapshot.question.id },
    });
    await save(record);
    return { holdReview: false };
  }
  const input = await unreadAnswerInput(context, record, observed, {
    signal: controller.signal,
  });
  const historyReceipt = await unreadHistoryAnswerReceipt({
    store: context.store,
    source: record.source,
    snapshot,
    history: observation.history,
    handle,
    input,
    signal: controller.signal,
  });
  const rejectionCandidate =
    record.settings?.rejectionsFirst && observation.rejectionCandidate;
  if (
    rejectionCandidate &&
    !historyReceipt.reason &&
    verifiedPassiveRejection(snapshot, observation.history)
  ) {
    return finishRejection({
      record,
      snapshot,
      handle,
      save,
      signal: controller.signal,
      historyReceipt,
    });
  }
  const reuse = isBrowserReuseOffer(record.source, snapshot);
  const baseline =
    snapshot.question.outgoing || reuse
      ? null
      : await previewAnswer(context.store, input);
  const link = unreadFormLink(record.prefillForms, snapshot, record.source);
  const reviewed = await review(
    { source: record.source, chat: snapshot.chat },
    observed,
    {
      ...input,
      modelDraft:
        !reuse &&
        !rejectionCandidate &&
        !historyReceipt.reason &&
        !link &&
        mayDraftUnreadAnswer(record, snapshot, baseline),
    },
    { signal: controller.signal }
  );
  const plan = reviewed.plan;
  const entry = {
    chat: snapshot.chat,
    reviewId: reviewed.id,
    preview: snapshot.question.body.slice(0, 600),
    answer: {
      phase: 'review',
      questionId: snapshot.question.id,
      ...historyReceipt,
    },
  };
  record.entries.push(entry);
  await save(record);
  if (historyReceipt.reason || rejectionCandidate) {
    await handle.holdReviewInactive();
    return { holdReview: true };
  }
  if (reuse) {
    return visitReuseOffer({
      context,
      record,
      snapshot,
      observed,
      handle,
      controller,
      entry,
      input,
      save,
    });
  }
  const handoff = unreadFormHandoff(snapshot, link, baseline);
  const handled = !link && alreadyHandled(snapshot, plan);
  const summaries =
    handoff?.summaries ?? (handled ? handledSummaries(snapshot, plan) : []);
  if (
    summaries.length &&
    !(await finishSummary({
      context,
      record,
      snapshot,
      summaries,
      handle,
      input,
      signal: controller.signal,
      entry,
    }))
  ) {
    await save(record);
    return { holdReview: true };
  }
  if (handled) {
    entry.answer.phase = 'no-reply';
    await save(record);
    return { holdReview: false };
  }
  if (
    await visitUnreadForm({
      context,
      record,
      snapshot,
      handle,
      signal: controller.signal,
      entry,
      save,
      link,
      canAdvance: handoff !== null,
      verifyNotices: handoff?.usesApprovedNotice
        ? async () =>
            unreadFormHandoff(
              snapshot,
              link,
              await previewAnswer(context.store, input)
            ) !== null
        : undefined,
    })
  ) {
    return { holdReview: false };
  }
  const verify = async () => {
    if (
      controller.signal.aborted ||
      !(await sameUnreadAnswer(
        context.store,
        await unreadAnswerInput(context, record, observed, {
          signal: controller.signal,
        }),
        baseline,
        plan
      )) ||
      controller.signal.aborted
    ) {
      throw unreadFailure(
        'question-watch-plan-changed',
        'The saved answer or policy changed.'
      );
    }
  };
  if (!record.reviewChoices && maySelect(snapshot, plan)) {
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
        recent: observed.messages ? input.recent : undefined,
      })
    ) {
      return { holdReview: false };
    }
  } else if (snapshot.strictOptions && !snapshot.answerOptions.length) {
    entry.answer.phase = 'pending-options';
  } else if (record.reviewChoices && snapshot.strictOptions) {
    entry.answer.phase = 'choice-review';
  }
  // Claim the held view before writing. Even a lost prefill response must not
  // navigate over a newly prepared draft or visit another conversation.
  await handle.holdReviewInactive();
  if (
    !snapshot.strictOptions &&
    !snapshot.hasDraft &&
    !entry.form &&
    (plan?.complete || plan?.model?.used) &&
    !plan.linkReview &&
    !plan.pending?.blocked &&
    plan.text?.trim()
  ) {
    const result = await handle.prefillInactive(
      {
        ...snapshot,
        ...(observed.messages ? { recent: input.recent } : {}),
      },
      plan.text,
      verify
    );
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
