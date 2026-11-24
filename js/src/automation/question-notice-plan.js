import { readAnswerPolicy, rejectedAnswer } from './question-policy.js';
import {
  noticePolicyFor,
  repliesAutomatically,
} from './question-notice-policy.js';
import { prepareAnswerPreview, previewAnswer } from './question-store.js';
import {
  completedHandover,
  completedNotice,
  handoverAnswer,
  noticeAddsTask,
  noticeHasLink,
  noticeIntent,
  passiveRejection,
  rejectionNotice,
} from './question-notice-intent.js';
import { recognizedAcknowledgement } from './question-acknowledgement.js';
import {
  exactApprovedNotice,
  recognizedNoticeAnswer,
} from './question-acknowledgement-answer.js';
import { planAnswer } from './question-answers.js';
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

const pendingNotice = (snapshot, source, recognize) => {
  const rows = snapshot.pendingTurn?.messages ?? [];
  const pendingRow = (row) => noticeHasLink(row) || !completedNotice(row.body);
  const recent = recognize && rows.findLast(pendingRow);
  const language = recent && recognizedAcknowledgement(recent, source);
  const pending = rows.filter((row, index) => {
    if (!pendingRow(row)) {
      return false;
    }
    const next = rows[index + 1];
    const completedBinary =
      language &&
      source === 'hh' &&
      next &&
      handoverAnswer(row.body) &&
      !noticeHasLink(row) &&
      !noticeHasLink(next) &&
      completedHandover(next.body);
    return !completedBinary;
  });
  const message = pending.length === 1 ? pending[0] : null;
  const kind =
    message && (language ? 'acknowledgements' : noticeIntent(message.body));
  return { message, kind, language: message && language };
};

const verifiedHistory = (message, snapshot, history) => {
  if (
    !message ||
    snapshot.strictOptions ||
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

export const verifiedPassiveRejection = (snapshot, history) => {
  if (snapshot.hasDraft || snapshot.question.outgoing) {
    return false;
  }
  const { message, kind } = pendingNotice(snapshot, 'hh', false);
  return (
    kind === 'rejections' &&
    passiveRejection(message) &&
    verifiedHistory(message, snapshot, history)
  );
};

const validReply = (text, policy) =>
  typeof text === 'string' &&
  Boolean(text.trim()) &&
  text.length <= 12000 &&
  !rejectedAnswer(text, policy);

const acknowledgementAnswer = async (store, input, language) => {
  if (!language) {
    return previewAnswer(store, input);
  }
  const { context } = await prepareAnswerPreview(store, input);
  const exact = planAnswer(input.question, context);
  return exactApprovedNotice(exact)
    ? exact
    : (recognizedNoticeAnswer(input.question, language, context, exact) ??
        exact);
};

const replyEnabled = (mode, message, language) =>
  language
    ? mode === 'reply-recognized'
    : repliesAutomatically(mode) &&
      !noticeHasLink(message) &&
      !noticeAddsTask(message.body);

export const canCheckSelectedAcknowledgement = (snapshot, source, mode) => {
  if (
    snapshot.question.outgoing ||
    snapshot.hasDraft ||
    snapshot.strictOptions ||
    !snapshot.noticeContext?.canReply
  ) {
    return false;
  }
  const { message, kind, language } = pendingNotice(
    snapshot,
    source,
    mode === 'reply-recognized'
  );
  return kind === 'acknowledgements' && replyEnabled(mode, message, language);
};

/** Read-only decision. Only a complete owned conversation can authorize admission. */
export const planNoticeReply = async ({
  store,
  target,
  planning,
  snapshot,
  history,
}) => {
  const policy = await readAnswerPolicy(store);
  const notices = noticePolicyFor(policy.notices, target.source, snapshot.chat);
  const recognize = notices.acknowledgements === 'reply-recognized';
  const { message, kind, language } = pendingNotice(
    snapshot,
    target.source,
    recognize
  );
  const decision = {
    kind,
    mode: kind ? notices[kind] : 'review',
    status: 'review',
  };
  if (snapshot.question.outgoing) {
    return { ...decision, status: 'waiting' };
  }
  if (snapshot.hasDraft) {
    return { ...decision, status: 'owner-draft' };
  }
  if (
    !snapshot.noticeContext?.canReply ||
    !verifiedHistory(message, snapshot, history)
  ) {
    return decision;
  }
  decision.historyVerified = true;
  if (!language && noticeHasLink(message)) {
    return decision;
  }
  if (decision.mode === 'ignore') {
    return { ...decision, status: 'ignored' };
  }
  if (!replyEnabled(decision.mode, message, language)) {
    return decision;
  }
  let text;
  let evidence;
  if (kind === 'rejections') {
    if (rejectionAnswered(history.rows)) {
      return { ...decision, reason: 'rejection-already-answered' };
    }
    text = notices.rejectionReply;
  } else {
    const input = {
      ...planning,
      source: target.source,
      chat: snapshot.chat,
      question: message.body,
      modelDraft: false,
      approximate: false,
      options: [],
      strictOptions: false,
    };
    evidence = await acknowledgementAnswer(store, input, language);
    if (!evidence.recognizedAcknowledgement && !exactApprovedNotice(evidence)) {
      return { ...decision, evidence };
    }
    text = evidence.text;
  }
  if (!validReply(text, policy)) {
    return decision;
  }
  return { ...decision, status: 'ready', message: message.id, text, evidence };
};
