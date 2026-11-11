import { answerChoiceState } from './question-options.js';

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

export const checkBrowserQuestion = (snapshot) => {
  const question = snapshot?.question;
  if (
    !boundedBrowserText(snapshot?.chat, 480) ||
    !boundedBrowserText(question?.id, 480) ||
    !boundedBrowserText(question?.body, 6000) ||
    typeof question.outgoing !== 'boolean' ||
    typeof snapshot.hasDraft !== 'boolean' ||
    typeof snapshot.strictOptions !== 'boolean' ||
    !Array.isArray(snapshot.answerOptions)
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
