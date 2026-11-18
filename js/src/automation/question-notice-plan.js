import { readAnswerPolicy, rejectedAnswer } from './question-policy.js';
import { previewAnswer } from './question-store.js';
import {
  completedNotice,
  noticeAddsTask,
  noticeIntent,
  rejectionNotice,
} from './question-notice-intent.js';
import { browserPendingTurn } from '../sources/browser-pending-turn.js';

const rejectionAnswered = (rows) => {
  let rejected = false;
  for (const row of rows) {
    if (row.outgoing && rejected) {
      return true;
    }
    if (!row.outgoing && !row.service && rejectionNotice(row.body)) {
      rejected = true;
    }
  }
  return false;
};

const pendingNotice = (snapshot) => {
  const pending =
    snapshot.pendingTurn?.messages?.filter(
      (row) => !completedNotice(row.body)
    ) ?? [];
  const message = pending.length === 1 ? pending[0] : null;
  const kind = message && noticeIntent(message.body);
  return { message, kind };
};

const verifiedHistory = (message, snapshot, history) => {
  if (
    !message ||
    snapshot.strictOptions ||
    !snapshot.noticeContext?.canReply ||
    history?.coverage?.complete !== true ||
    history.restored !== true
  ) {
    return false;
  }
  // The restored current turn must be the same conversation suffix just read.
  const last = history.rows?.at(-1);
  if (
    last?.id !== snapshot.question.id ||
    last.body !== snapshot.question.body ||
    last.outgoing ||
    JSON.stringify(browserPendingTurn(history.rows)) !==
      JSON.stringify(snapshot.pendingTurn)
  ) {
    return false;
  }
  return true;
};
const approvedNotice = (evidence) =>
  evidence.approvedNoticeText &&
  evidence.match === 'exact' &&
  evidence.complete &&
  !evidence.noReply &&
  !evidence.learnedPattern;
const validReply = (text, policy) =>
  typeof text === 'string' &&
  Boolean(text.trim()) &&
  text.length <= 12000 &&
  !rejectedAnswer(text, policy);

/** Read-only decision. Only a complete owned conversation can authorize admission. */
export const planNoticeReply = async ({
  store,
  target,
  planning,
  snapshot,
  history,
}) => {
  const policy = await readAnswerPolicy(store);
  const { message, kind } = pendingNotice(snapshot);
  const decision = {
    kind,
    mode: kind ? policy.notices[kind] : 'review',
    status: 'review',
  };
  if (snapshot.question.outgoing) {
    return { ...decision, status: 'waiting' };
  }
  if (snapshot.hasDraft) {
    return { ...decision, status: 'owner-draft' };
  }
  if (!verifiedHistory(message, snapshot, history)) {
    return decision;
  }
  decision.historyVerified = true;
  if (decision.mode === 'ignore') {
    return { ...decision, status: 'ignored' };
  }
  if (
    decision.mode !== 'reply' ||
    kind === 'invitations' ||
    noticeAddsTask(message.body)
  ) {
    return decision;
  }
  let text;
  let evidence;
  if (kind === 'rejections') {
    if (rejectionAnswered(history.rows)) {
      return { ...decision, reason: 'rejection-already-answered' };
    }
    text = policy.notices.rejectionReply;
  } else {
    evidence = await previewAnswer(store, {
      ...planning,
      source: target.source,
      chat: snapshot.chat,
      question: message.body,
      modelDraft: false,
      approximate: false,
      options: [],
      strictOptions: false,
    });
    if (!approvedNotice(evidence)) {
      return { ...decision, evidence };
    }
    text = evidence.text;
  }
  if (!validReply(text, policy)) {
    return decision;
  }
  return { ...decision, status: 'ready', message: message.id, text, evidence };
};
