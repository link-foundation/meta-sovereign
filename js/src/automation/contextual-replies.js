// Independent bounded recognition after reading the pinned VK trigger/tests.
import {
  incomingPersonalVk,
  wholeVkQuestion,
} from '../crm/identity-question.js';
import { isGreetingMessage } from '../greetings/detect.js';
import {
  vkIncomingGreetingStickerIds,
  vkGreetingStickers,
} from '../greetings/catalog.js';
import { greetingDestinationReason } from '../greetings/plan.js';
import {
  latestReplyMessage,
  personalReplyDraft,
  personalReplyPreset,
  replyFingerprint,
  replyVariantIndex,
} from './personal-reply.js';
import { acquaintanceText } from './acquaintance.js';
import { prefillLinkFor } from '../crm/reengage.js';
import { negativeAcquaintanceReply } from './engagement.js';

export const contextualReplyKinds = [
  'first-exchange',
  'wellbeing',
  'purpose',
  'clarification',
];
export const catalogReplyKinds = [
  'acquaintance',
  ...contextualReplyKinds,
  'engagement',
];
export const personalReplyKinds = [
  'gratitude',
  'identity',
  ...catalogReplyKinds,
];
const greetingIds = new Set([
  ...vkIncomingGreetingStickerIds,
  ...vkGreetingStickers.map((s) => s.id),
]);
const greeting = (message) =>
  String(message?.body ?? '').length <= 256 &&
  isGreetingMessage(message, greetingIds);
const boundedWords = (body) =>
  typeof body === 'string' && body.length <= 256
    ? (
        body
          .normalize('NFKC')
          .toLowerCase()
          .match(/[\p{L}\p{N}]+/gu) ?? []
      ).join(' ')
    : null;
const wellbeing = (body) => {
  const words = boundedWords(body);
  if (!words || (body.match(/\?/gu) ?? []).length > 1) {
    return false;
  }
  return [
    'как дела',
    'как жизнь',
    'как поживаешь',
    'how are you',
    'привет как дела',
  ].includes(words);
};
const purpose = (body) =>
  [
    'ты что то хотел',
    'вы что то хотели',
    'ты что то хотели',
    'вы что то хотел',
  ].includes(wholeVkQuestion(body));
const clarification = (body) =>
  typeof body === 'string' &&
  body.length <= 256 &&
  /[?⁉❔]/u.test(body) &&
  /^\s*м*[^\p{L}\p{N}]*$/iu.test(body.normalize('NFKC'));
export const recognizesContextualReply = (kind, message) => {
  if (kind === 'first-exchange') {
    return greeting(message);
  }
  if (kind === 'wellbeing') {
    return wellbeing(message?.body);
  }
  if (kind === 'purpose') {
    return purpose(message?.body);
  }
  if (kind === 'engagement') {
    return negativeAcquaintanceReply(message?.body);
  }
  return kind === 'clarification' && clarification(message?.body);
};
export const contextualMessageReason = (kind, message, isSelf) => {
  if (!incomingPersonalVk(message, isSelf)) {
    return `${kind}-incoming-required`;
  }
  return recognizesContextualReply(kind, message)
    ? null
    : `${kind}-question-required`;
};
const outgoingPersonal = (message, isSelf) =>
  Boolean(
    message &&
    (message.outgoing || message.out || isSelf(message.sender)) &&
    !message.deleted &&
    !message.service &&
    !greetingDestinationReason({ ...message, network: message.source })
  );

// Keep the adjacent outgoing turn in the proof; never invent adjacency by
// filtering earlier incoming messages out of the conversation.
export const contextualHistory = (
  kind,
  messages,
  isSelf,
  total = messages.length
) => {
  if (!['first-exchange', 'clarification', 'engagement'].includes(kind)) {
    return null;
  }
  if (kind === 'first-exchange' && total !== 2) {
    return false;
  }
  const latest = latestReplyMessage(messages);
  if (!latest || contextualMessageReason(kind, latest, isSelf)) {
    return false;
  }
  const previous = latestReplyMessage(
    messages.filter((message) => message.id !== latest.id)
  );
  if (!outgoingPersonal(previous, isSelf)) {
    return false;
  }
  if (kind === 'first-exchange' && !greeting(previous)) {
    return false;
  }
  if (
    kind === 'engagement' &&
    wholeVkQuestion(previous.body) !== 'мы общались ранее'
  ) {
    return false;
  }
  return [replyFingerprint(previous), replyFingerprint(latest)];
};
export const contextualReplyDraft = (automation, candidate, draft, isSelf) => {
  const kind = automation.action.kind.slice('reply-'.length);
  const context = contextualHistory(kind, candidate.messages, isSelf);
  if (context === false) {
    return { reason: `${kind}-context-required` };
  }
  const latest = latestReplyMessage(candidate.messages);
  const text = latest
    ? acquaintanceText(automation, draft, draft.form, latest.id)
    : draft.text;
  const result = personalReplyDraft(
    automation,
    candidate,
    { ...draft, text, prefill: prefillLinkFor({ ...draft, text }) },
    isSelf,
    kind,
    (message, owner) => contextualMessageReason(kind, message, owner)
  );
  if (result.draft && context) {
    result.draft[kind].context = context;
  }
  if (result.draft && kind === 'engagement') {
    const ids = automation.action.stickerIds;
    result.draft.engagement.sticker =
      ids[replyVariantIndex(latest.id, ids.length)];
  }
  return result;
};

export const contextualReplyPresets = () =>
  [
    [
      'first-exchange',
      'Ask whether previously acquainted',
      'Review a question after exactly two recorded personal VK greetings: yours, then theirs.',
      'Мы общались ранее?',
      'Мы общались ранее?',
    ],
    [
      'wellbeing',
      'Reply to well-being questions',
      'Review your configurable reply to a complete personal VK well-being question in Russian or English.',
      'Всё хорошо. А у тебя?',
      'Всё хорошо. А у Вас?',
    ],
    [
      'purpose',
      'Reply to purpose questions',
      'Review your configurable reply when a personal VK contact asks whether you wanted something.',
      'Да, предложить дружбу.',
      'Да, предложить дружбу.',
    ],
    [
      'clarification',
      'Clarify an unspecified question',
      'Review a clarification of a bare question only after the adjacent outgoing personal VK turn.',
      'Что именно тебя интересует?',
      'Что именно Вас интересует?',
    ],
    [
      'engagement',
      'Introduce yourself after a negative acquaintance answer',
      'Review a VK sticker followed by your introduction after a negative answer to the adjacent previous-acquaintance question.',
      'Рад познакомиться. Расскажи о себе?',
      'Рад познакомиться. Расскажите о себе?',
    ],
  ].map(([id, name, description, informal, formal]) =>
    personalReplyPreset(id, name, description, { informal, formal })
  );
