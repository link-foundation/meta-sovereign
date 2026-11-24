// Applicant-oriented HH messages. Roles come from the provider, never from
// display names or read receipts. Negotiation cards alone are not messages.
import { buildMessageLink } from './link.js';
import { hhAnswerContext } from './hh-context.js';

const scalar = (value) =>
  (typeof value === 'string' && value.trim()) ||
  (typeof value === 'number' && Number.isFinite(value))
    ? String(value)
    : null;
const roleOf = (message) => message.author?.participant_type;
const direction = (message) => {
  if (typeof message.outgoing === 'boolean') {
    return { outgoing: message.outgoing };
  }
  const role = roleOf(message);
  return ['applicant', 'employer'].includes(role)
    ? { outgoing: role === 'applicant' }
    : {};
};
const senderOf = (message) =>
  scalar(message.author?.id) ??
  scalar(message.from) ??
  (['applicant', 'employer'].includes(roleOf(message))
    ? roleOf(message)
    : 'unknown');
const replyOf = (message) =>
  scalar(message.replyTo) ??
  scalar(message.reply_to?.id) ??
  scalar(message.reply_to);

export const hhMessageMetadata = (message) => ({
  sender: senderOf(message),
  ...direction(message),
  ...(message.service === true ||
  (roleOf(message) === 'applicant' && message.state?.id === 'response')
    ? { service: true }
    : {}),
  ...(message.deleted === true ? { deleted: true } : {}),
  ...(typeof message.edited_at === 'string'
    ? { edited: message.edited_at }
    : {}),
  ...(replyOf(message)
    ? {
        replyTo: replyOf(message).startsWith('msg:hh:')
          ? replyOf(message)
          : `msg:hh:${replyOf(message)}`,
      }
    : {}),
});

const nestedMessages = (negotiation) =>
  Array.isArray(negotiation.messages)
    ? negotiation.messages
    : Array.isArray(negotiation.messages?.items)
      ? negotiation.messages.items
      : null;

const messageBody = (message) =>
  typeof message.text === 'string'
    ? message.text
    : typeof message.message === 'string'
      ? message.message
      : '';

const messageLink = (message, negotiation, { nested, legacyFlat }) => {
  const externalId = scalar(message?.id);
  if (!externalId || !message || typeof message !== 'object') {
    throw new Error('HH history contains a message without a stable ID');
  }
  const vacancy = message.vacancy ?? negotiation.vacancy;
  const vacancyChat = `vacancy:${scalar(vacancy?.id) ?? 'unknown'}`;
  const chat =
    legacyFlat && !nested
      ? `vacancy:${vacancy?.id}`
      : (scalar(negotiation.id) ?? vacancyChat);
  return {
    ...hhAnswerContext(vacancy),
    ...buildMessageLink({
      source: 'hh',
      externalId,
      chat,
      body: messageBody(message),
      // A missing timestamp is a chronology barrier, never the card's date.
      timestamp: message.created_at ?? message.createdAt ?? null,
      raw: message,
      ...hhMessageMetadata(message),
    }),
  };
};

export const normalizeHhMessages = (payload, { legacyFlat = false } = {}) => {
  const items = payload?.items ?? payload?.negotiations ?? [];
  if (!Array.isArray(items)) {
    throw new Error('HH history must contain a list of negotiations');
  }
  return items.flatMap((negotiation) => {
    if (!negotiation || typeof negotiation !== 'object') {
      return [];
    }
    const nested = nestedMessages(negotiation);
    const records =
      nested ??
      (negotiation.messages === undefined &&
      (typeof negotiation.text === 'string' ||
        typeof negotiation.message === 'string')
        ? [negotiation]
        : []);
    return records.map((message) =>
      messageLink(message, negotiation, {
        nested: nested !== null,
        legacyFlat,
      })
    );
  });
};
