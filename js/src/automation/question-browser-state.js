import { answerChoiceState } from './question-options.js';
import { checkedBrowserPendingTurn } from '../sources/browser-pending-turn.js';

export const browserWatchId = (id) =>
  typeof id === 'string' &&
  /^question-watch:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u.test(
    id
  );

export const browserReviewId = (value) =>
  typeof value === 'string' &&
  /^question-browser:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/u.test(
    value
  );

export const boundedBrowserText = (value, max) =>
  typeof value === 'string' && Boolean(value.trim()) && value.length <= max;

export const validChoiceSources = (sources) =>
  Array.isArray(sources) &&
  sources.length <= 50 &&
  sources.every(
    (source) =>
      boundedBrowserText(source?.id, 80) && boundedBrowserText(source.name, 120)
  );

const checkedNoticeContext = (context) => {
  if (context === undefined) {
    return undefined;
  }
  if (
    ![context?.company, context?.vacancy].every((value) =>
      boundedBrowserText(value, 600)
    ) ||
    !boundedBrowserText(context.vacancyUrl, 600) ||
    typeof context.canReply !== 'boolean'
  ) {
    throw Object.assign(
      new Error('The employer chat context was not verified.'),
      { code: 'question-browser-unverified' }
    );
  }
  return {
    company: context.company,
    vacancy: context.vacancy,
    vacancyUrl: context.vacancyUrl,
    canReply: context.canReply,
  };
};

const noticeProperties = (snapshot) =>
  snapshot.noticeContext
    ? { noticeContext: checkedNoticeContext(snapshot.noticeContext) }
    : {};

export const checkBrowserQuestion = (snapshot) => {
  const question = snapshot?.question;
  const pendingTurn =
    question && checkedBrowserPendingTurn(snapshot.pendingTurn, question);
  if (
    !boundedBrowserText(snapshot?.chat, 480) ||
    !boundedBrowserText(question?.id, 480) ||
    !boundedBrowserText(question?.body, 6000) ||
    typeof question.outgoing !== 'boolean' ||
    typeof snapshot.hasDraft !== 'boolean' ||
    typeof snapshot.strictOptions !== 'boolean' ||
    !Array.isArray(snapshot.answerOptions) ||
    pendingTurn === null
  ) {
    throw Object.assign(
      new Error('The current provider question was not verified.'),
      {
        code: 'question-browser-unverified',
        fallback: false,
      }
    );
  }
  const choices = answerChoiceState(question.body, {
    options: snapshot.answerOptions,
    strictOptions: snapshot.strictOptions,
  });
  return {
    chat: snapshot.chat,
    question: {
      id: question.id,
      body: question.body,
      outgoing: question.outgoing,
    },
    hasDraft: snapshot.hasDraft,
    strictOptions: choices.strictOptions,
    answerOptions: [...choices.options],
    ...(pendingTurn ? { pendingTurn } : {}),
    ...noticeProperties(snapshot),
  };
};

/** Keep only an exact, bounded positive browser message receipt. */
export const browserChoiceReceipt = (result, draft) => {
  if (
    result?.via !== 'browser' ||
    result.source !== draft.source ||
    result.chat !== String(draft.chat) ||
    result.option !== draft.text ||
    typeof result.messageId !== 'string' ||
    !result.messageId.trim() ||
    result.messageId.length > 480
  ) {
    return null;
  }
  return {
    via: 'browser',
    source: result.source,
    chat: result.chat,
    option: result.option,
    messageId: result.messageId,
  };
};

/** Text receipts bind the full reviewed body, including text beyond the log preview. */
export const browserTextReceipt = (result, draft) => {
  if (!boundedBrowserText(draft.text, 12000)) {
    return null;
  }
  const receipt = browserChoiceReceipt(
    { ...result, option: result?.text },
    draft
  );
  if (!receipt) {
    return null;
  }
  const { option, ...identity } = receipt;
  return { ...identity, text: option };
};

export const browserAnswerReceipt = (result, draft) =>
  draft.answer?.textReply
    ? browserTextReceipt(result, draft)
    : draft.answer?.strictOptions
      ? browserChoiceReceipt(result, draft)
      : null;

/** Shared server/client validation of a persisted positive provider receipt. */
export const browserReviewReceipt = (outbox, snapshot, target) => {
  const draft = { source: target.source, chat: snapshot.chat };
  if (outbox?.answerType === 'text') {
    return browserTextReceipt(outbox.receipt, { ...draft, text: outbox.text });
  }
  const option = outbox?.receipt?.option;
  return snapshot.answerOptions.filter((value) => value === option).length === 1
    ? browserChoiceReceipt(outbox?.receipt, { ...draft, text: option })
    : null;
};

export const browserChoiceDraft = (record, option = '') => {
  const { target, snapshot } = record;
  const message = `msg:${target.source}:${snapshot.chat}:${snapshot.question.id}`;
  return {
    ...target,
    chat: snapshot.chat,
    text: option,
    answer: {
      message,
      strictOptions: true,
      option,
      ...(snapshot.pendingTurn
        ? { pendingTurn: globalThis.structuredClone(snapshot.pendingTurn) }
        : {}),
      turn: {
        messages: [
          {
            id: message,
            body: snapshot.question.body,
            options: JSON.stringify(snapshot.answerOptions),
            strictOptions: true,
          },
        ],
      },
    },
  };
};

export const checkedBrowserChoiceReceipt = (result, draft) => {
  if (!browserChoiceReceipt(result, draft)) {
    throw Object.assign(
      new Error('The native selection receipt could not be verified.'),
      { code: 'send-unknown', fallback: false, ambiguous: true }
    );
  }
  return result;
};

export const checkBrowserWatchReceipt = (value) => {
  if (value.outbox?.status === 'sent' && value.outbox.resolvedBy !== 'user') {
    if (value.selection?.type === 'text') {
      if (
        !browserTextReceipt(value.outbox.receipt, {
          source: value.target.source,
          chat: value.selection.chat,
          text: value.selection.text,
        })
      ) {
        throw Object.assign(
          new Error('The text watcher receipt was not verified.'),
          { code: 'question-browser-receipt-missing' }
        );
      }
      return value;
    }
    checkedBrowserChoiceReceipt(value.outbox.receipt, {
      source: value.target.source,
      chat: value.selection?.chat,
      text: value.selection?.option,
    });
  }
  return value;
};
