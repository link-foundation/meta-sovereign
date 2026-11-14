import { checkBrowserQuestion } from './question-browser-state.js';
import { planNoticeReply } from './question-notice-plan.js';
import {
  deliverNoticeReply,
  noticeReplyDraft,
  noticeDeliveryState,
  rejectionReplyKey,
} from './question-notice-delivery.js';
import { questionChoiceKey } from './question-choice-key.js';
import { unreadFailure } from './question-unread-state.js';

/** Decisions and selections flush while this native chat visit is still owned. */
export const visitUnreadNotice = async ({
  context,
  record,
  controller,
  observation,
  handle,
  reviewEntry,
  save,
}) => {
  const snapshot = checkBrowserQuestion(handle.snapshot);
  if (snapshot.chat !== observation.chat) {
    throw unreadFailure(
      'question-unread-unverified',
      'The borrowed conversation changed.'
    );
  }
  const entry = await reviewEntry(
    { ...observation, question: snapshot },
    record
  );
  const input = {
    store: context.store,
    target: { source: record.source, chat: entry.chat },
    planning: record.planning,
    snapshot,
    history: observation.history,
  };
  const plan = await planNoticeReply(input);
  entry.notice = { phase: plan.status, kind: plan.kind };
  record.entries.push(entry);
  await save(record);
  if (plan.status !== 'ready') {
    return;
  }
  const verify = async () => {
    if (controller.signal.aborted) {
      throw unreadFailure(
        'question-unread-stopped',
        'This unread pass stopped.'
      );
    }
    if (JSON.stringify(await planNoticeReply(input)) !== JSON.stringify(plan)) {
      throw unreadFailure(
        'question-watch-plan-changed',
        'The saved notice policy or answer changed.'
      );
    }
  };
  const draft = noticeReplyDraft(input.target, snapshot, plan);
  const selection = {
    type: 'text',
    chat: entry.chat,
    text: draft.text,
    key:
      plan.kind === 'rejections'
        ? rejectionReplyKey(draft)
        : questionChoiceKey(draft),
  };
  entry.notice = { ...entry.notice, phase: 'selecting', selection };
  await save(record);
  await verify();
  const { outcome } = await deliverNoticeReply({
    context,
    runtime: { record: { id: record.id, target: input.target }, handle },
    snapshot,
    plan,
    verify,
  });
  const { state, ...delivery } = noticeDeliveryState(outcome, draft, selection);
  entry.notice = { ...entry.notice, ...delivery };
  await save(record);
  if (state === 'paused') {
    throw unreadFailure('question-unread-notice-paused', delivery.reason);
  }
};
