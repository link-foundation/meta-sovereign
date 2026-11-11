import {
  checkBrowserQuestion,
  browserTextReceipt,
} from './question-browser-state.js';
import { planNoticeReply } from './question-notice-plan.js';
import {
  deliverNoticeReply,
  noticeReplyDraft,
  rejectionReplyKey,
} from './question-notice-delivery.js';
import { questionChoiceKey } from './question-choice-key.js';
import {
  questionWatchFailure,
  saveQuestionWatch,
} from './question-watch-records.js';

const checked = (runtime) => {
  if (!runtime.fresh()) {
    throw questionWatchFailure('question-watch-stopped');
  }
};

const noticeSnapshot = async (context, runtime) => {
  let snapshot;
  let history;
  try {
    snapshot = checkBrowserQuestion(
      await runtime.handle.readInactiveQuestion()
    );
    checked(runtime);
    if (
      !snapshot.question.outgoing &&
      !snapshot.hasDraft &&
      snapshot.noticeContext?.canReply &&
      !snapshot.strictOptions
    ) {
      history = await runtime.handle.readInactiveHistory({
        signal: runtime.controller.signal,
        verifyCurrent: () => checked(runtime),
      });
      checked(runtime);
      snapshot = checkBrowserQuestion(
        await runtime.handle.readInactiveQuestion()
      );
    }
  } catch (error) {
    if (error.code === 'browser-background-owner-active' && runtime.fresh()) {
      await saveQuestionWatch(context, runtime, { phase: 'owner-active' });
      return null;
    }
    throw error;
  }
  return { snapshot, history };
};

const noticeOutcomePhase = (delivered, outbox, uncertain) =>
  delivered
    ? outbox?.resolvedBy === 'user'
      ? 'marked-sent'
      : 'sent'
    : uncertain
      ? 'unknown'
      : 'failed';

const saveNoticeOutcome = async (
  context,
  runtime,
  outcome,
  draft,
  selection
) => {
  const delivered =
    outcome.status === 'sent' || outcome.code === 'already-sent';
  const outbox = outcome.outbox ?? null;
  if (
    delivered &&
    outbox?.resolvedBy !== 'user' &&
    !browserTextReceipt(outbox?.receipt, { ...draft, text: outbox?.text })
  ) {
    throw questionWatchFailure('question-browser-receipt-missing');
  }
  const uncertain =
    outcome.status === 'unknown' || outcome.code === 'send-in-doubt';
  await saveQuestionWatch(context, runtime, {
    outbox,
    selection: { ...selection, text: outbox?.text ?? draft.text },
    phase: noticeOutcomePhase(delivered, outbox, uncertain),
    ...(!delivered
      ? { state: 'paused', reason: outcome.code ?? 'notice-reply-refused' }
      : {}),
  });
};

/** A separately selected mode: never navigate, prefill foreground or select chips. */
export const tickQuestionNotices = async (context, runtime) => {
  const current = await noticeSnapshot(context, runtime);
  if (!current) {
    return;
  }
  const { snapshot, history } = current;
  const input = {
    store: context.store,
    target: runtime.record.target,
    planning: runtime.record.planning,
    snapshot,
    history,
  };
  const plan = await planNoticeReply(input);
  await saveQuestionWatch(context, runtime, {
    last: { snapshot, plan },
    phase: plan.status,
  });
  if (plan.status !== 'ready') {
    return;
  }
  const verify = async () => {
    checked(runtime);
    const current = await planNoticeReply(input);
    if (JSON.stringify(current) !== JSON.stringify(plan)) {
      throw questionWatchFailure('question-watch-plan-changed');
    }
  };
  const draft = noticeReplyDraft(runtime.record.target, snapshot, plan);
  const selection = {
    type: 'text',
    chat: draft.chat,
    text: draft.text,
    key:
      plan.kind === 'rejections'
        ? rejectionReplyKey(draft)
        : questionChoiceKey(draft),
  };
  await verify();
  await saveQuestionWatch(context, runtime, { phase: 'selecting', selection });
  const { outcome } = await deliverNoticeReply({
    context,
    runtime,
    snapshot,
    plan,
    verify,
  });
  await saveNoticeOutcome(context, runtime, outcome, draft, selection);
};
