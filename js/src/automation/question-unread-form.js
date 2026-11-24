import { textLinks } from '../message-links.js';
import { respondentDestination } from '../forms/form-destination.js';
import { employerRatingDestination } from '../forms/employer-rating.js';
import {
  boundedBrowserText,
  checkBrowserQuestion,
} from './question-browser-state.js';
import { unreadFailure } from './question-unread-identity.js';
import { completedAnswerSummary } from './question-summary.js';
import { completedHandover } from './question-notice-intent.js';

const cleanTextUrl = (value) => value.replace(/[.,;:!?)\]}»”’]+$/u, '');
const activeTransfer = (state) =>
  ['prefilled', 'partial', 'waiting-owner', 'rating-ready'].includes(state);
export const unreadFormTransfer = (state) =>
  activeTransfer(state) || state === 'closed';
const ratingReview = (state) =>
  ['rating-closed', 'rating-sign-in', 'rating-unavailable'].includes(state);
const formDestination = (url) =>
  respondentDestination(url)?.url ?? employerRatingDestination(url);

export const unreadFormLink = (enabled, snapshot, source) => {
  if (
    !enabled ||
    snapshot.question.outgoing ||
    snapshot.strictOptions ||
    snapshot.hasDraft ||
    snapshot.noticeContext?.canReply === false
  ) {
    return null;
  }
  const messages = snapshot.pendingTurn?.messages;
  if (!messages?.length) {
    return null;
  }
  const forms = messages.flatMap((message) => {
    if (completedAnswerSummary(message.body)) {
      return [];
    }
    const targets = message.links ?? textLinks(message.body).map(cleanTextUrl);
    const urls = new Set(
      targets
        .map((target) =>
          source === 'hh' && snapshot.noticeContext?.company
            ? formDestination(target)
            : respondentDestination(target)?.url
        )
        .filter(Boolean)
    );
    return [...urls].map((url) => ({ messageId: message.id, url }));
  });
  return forms.length === 1 ? forms[0] : null;
};

const formOnly = ({ body, links }, link) => {
  const visible = textLinks(body).map(cleanTextUrl);
  if (
    [...visible, ...(links ?? [])].some(
      (value) => formDestination(value) !== link.url
    )
  ) {
    return false;
  }
  const instruction = visible
    .reduce((text, url) => text.replace(url, ''), body)
    .trim();
  if (employerRatingDestination(link.url)) {
    return /^(?:(?:please rate (?:us|our company)|employer rating(?: poll)?|(?:пожалуйста,?\s+)?оцените (?:нас|нашу компанию)|рейтинг работодателей)(?:[\s.:!]+(?:headhunter|hh\.ru))?|headhunter|hh\.ru)?[\s.:!]*$/iu.test(
      instruction
    );
  }
  return /^(?:please\s+(?:fill (?:in|out)|complete)\s+(?:the\s+|this\s+)?(?:questionnaire|form)|(?:please\s+)?(?:questionnaire|form)|(?:пожалуйста,?\s+)?(?:заполните\s+(?:эту\s+|нашу\s+)?)?анкет[ау]|请填写(?:此|这份)?(?:表格|问卷)|कृपया (?:यह )?फ़ॉर्म भरें)?[\s.:!]*$/iu.test(
    instruction
  );
};

/** A separate Forms review can resolve the turn only if no chat task remains. */
export const formHandoffSummaries = ({ pendingTurn }, link) => {
  if (!link) {
    return null;
  }
  const summaries = [];
  for (const message of pendingTurn.messages) {
    if (message.id === link.messageId) {
      if (!formOnly(message, link)) {
        return null;
      }
    } else if (message.links?.length || textLinks(message.body).length) {
      return null;
    } else if (completedAnswerSummary(message.body)) {
      summaries.push(message);
    } else if (!completedHandover(message.body)) {
      return null;
    }
  }
  return summaries;
};

export const visitUnreadForm = async ({
  context,
  record,
  snapshot,
  handle,
  signal,
  entry,
  save,
  link,
  canAdvance,
}) => {
  if (!link) {
    return false;
  }
  const verify = async () => {
    signal.throwIfAborted();
    const current = checkBrowserQuestion(await handle.readInactiveQuestion());
    if (JSON.stringify(current) !== JSON.stringify(snapshot)) {
      throw unreadFailure(
        'question-form-changed',
        'The linked form message changed. Review the current chat.'
      );
    }
    signal.throwIfAborted();
  };
  const rating = employerRatingDestination(link.url)
    ? {
        company: snapshot.noticeContext.company,
        seed: handle.seedRating,
      }
    : undefined;
  try {
    entry.form = await context.prefillLinkedForm({
      ...link,
      source: record.source,
      chat: snapshot.chat,
      planning: record.planning,
      signal,
      verify,
      ...(rating && { rating }),
    });
  } catch (error) {
    signal.throwIfAborted();
    entry.form = {
      ...link,
      state: 'refused',
      written: 0,
      code: boundedBrowserText(error?.code, 120)
        ? error.code
        : 'question-form-unconfirmed',
    };
  }
  const transferred = canAdvance && unreadFormTransfer(entry.form.state);
  if (transferred) {
    entry.answer.phase = 'form-review';
  }
  await save(record);
  return transferred;
};

const hasValidFormSlot = (value) =>
  typeof value.sessionId === 'string' &&
  /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/u.test(value.sessionId) &&
  boundedBrowserText(value.browserSlot, 80);

const compatibleFormState = ({ url, state, written }) => {
  if (!employerRatingDestination(url)) {
    return !state.startsWith('rating-');
  }
  return (
    written === 0 &&
    (state.startsWith('rating-') || ['refused', 'unconfirmed'].includes(state))
  );
};

const validFormSlot = (value) =>
  value.sessionId === undefined && value.browserSlot === undefined
    ? !activeTransfer(value.state) && !ratingReview(value.state)
    : value.state !== 'closed' && hasValidFormSlot(value);

export const validUnreadForm = (value) =>
  formDestination(value?.url) &&
  boundedBrowserText(value.messageId, 480) &&
  (unreadFormTransfer(value.state) ||
    ratingReview(value.state) ||
    ['refused', 'unconfirmed'].includes(value.state)) &&
  compatibleFormState(value) &&
  Number.isInteger(value.written) &&
  value.written >= 0 &&
  value.written <= 200 &&
  validFormSlot(value) &&
  (value.code === undefined || boundedBrowserText(value.code, 120));
