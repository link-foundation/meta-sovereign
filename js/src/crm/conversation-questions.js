// Shared question/answer turns. Explicit reply links outrank adjacency.
import {
  professionIn,
  friendshipProposal,
  accountNetwork,
  linkRequest,
  affirmation,
} from './conversation-rules.js';
const DAY_MS = 24 * 60 * 60_000;
const MAX_VALUE = 120;
const ANSWER_PARTS = 3;

// Word boundaries that know Cyrillic (`\b` knows only ASCII letters).
const W = '[\\p{L}\\p{M}\\p{N}_]';
const phrase = (source) => new RegExp(`(?<!${W})(?:${source})(?!${W})`, 'iu');

const textOf = (message) => String(message?.body ?? '').trim();
const timeOf = (message) => Date.parse(message?.timestamp ?? '') || 0;
const cut = (text, size = MAX_VALUE) =>
  text.length > size ? `${text.slice(0, size - 1)}…` : text;

const startsWith = (source) => new RegExp(`^(?:${source})(?!${W})`, 'iu');

const QUESTION_START = startsWith(
  [
    'как',
    'что',
    'чем',
    'где',
    'куда',
    'откуда',
    'когда',
    'почему',
    'зачем',
    'кто',
    'кем',
    'какой',
    'какая',
    'какое',
    'какие',
    'сколько',
    'можно',
    'нельзя ли',
    'не подскажете',
    'подскажи',
    'подскажите',
    'how',
    'what',
    'where',
    'when',
    'why',
    'who',
    'which',
    'do you',
    'did you',
    'are you',
    'can you',
    'could you',
    'would you',
    'is there',
    'have you',
  ].join('|')
);

/** Whether a message asks something. */
export const isQuestion = (text) => {
  const t = String(text ?? '').trim();
  if (!t) {
    return false;
  }
  if (/[?？]/u.test(t)) {
    return true;
  }
  // "Как дела" asks without a mark; "Что ж, ладно." does not ask.
  return t.length <= 120 && !/[.!]$/u.test(t) && QUESTION_START.test(t);
};

/**
 * What a question is about. Each is a list of phrases; the first that
 * matches names the question's intent.
 */
export const QUESTION_INTENTS = Object.freeze({
  address: phrase(
    'на (?:ты|вы)|перейд\\p{L}* на ты|по имени|on (?:a )?first[- ]name'
  ),
  work: phrase(
    [
      'где (?:ты |вы )?(?:сейчас )?работа\\p{L}*',
      'кем (?:ты |вы )?(?:сейчас )?работа\\p{L}*',
      'чем (?:ты |вы )?(?:сейчас )?занима\\p{L}*',
      '(?:кака\\p{L}|тво\\p{L}|ваш\\p{L}*) должност\\p{L}*',
      'професси\\p{L}*',
      'в какой компании',
      'what do you do',
      'where do you work',
      '(?:what|which) company',
      'your (?:job|role|position|occupation)',
    ].join('|')
  ),
  location: phrase(
    'откуда (?:ты|вы)|где (?:ты|вы) (?:живёшь|живешь|живёте|живете)|в каком городе|where (?:are you from|do you live)'
  ),
  accounts: phrase(
    'linkedin|линкедин|линкедине|github|гитхаб\\p{L}*|e-?mail|почт(?:а|у|ы|ой|е)|профил\\p{L}*|telegram|телеграм\\p{L}*'
  ),
  // When to talk (not why, nor whether).
  meeting: phrase(
    [
      'когда (?:созвон|встрет|поговор|увид|спиш)\\p{L}*',
      'в какое время',
      'во сколько',
      'когда (?:тебе|вам) удобно',
      'what time',
      'when (?:can|shall|should|could) we (?:call|meet|talk)',
      'when are you free',
    ].join('|')
  ),
});

/** The intent of a question, or null. */
export const intentOf = (text) => {
  if (friendshipProposal(text)) {
    return 'friendship';
  }
  if (professionIn(text)) {
    return 'work';
  }
  if (accountNetwork(text) || linkRequest(text)) {
    return 'accounts';
  }
  return (
    Object.entries(QUESTION_INTENTS).find(([, regex]) =>
      regex.test(String(text ?? ''))
    )?.[0] ?? null
  );
};

// Providers store either a link id, chat:number, or a network message id.
export const repliedId = (message) => {
  const reply = message?.replyTo;
  if (!reply) {
    return null;
  }
  const id = String(reply);
  if (id.startsWith('msg:')) {
    return id;
  }
  const source = message.source ?? String(message.id ?? '').split(':')[1];
  const chat =
    message.chat ??
    String(message.id ?? '')
      .split(':')
      .slice(2, -1)
      .join(':');
  return `msg:${source}:${id.includes(':') ? id : `${chat}:${id}`}`;
};

const sideOf = (message, isSelf) => (isSelf(message.sender) ? 'me' : 'them');

const asked = (message, isSelf) => ({
  id: message.id,
  replyTo: repliedId(message),
  at: message.timestamp ?? null,
  by: sideOf(message, isSelf),
  text: cut(textOf(message), 400),
});

const joinedAnswer = (parts, basis = 'adjacent') =>
  parts.length === 0
    ? null
    : {
        id: parts[0].id,
        ids: parts.map((part) => part.id),
        at: parts[0].timestamp ?? null,
        text: cut(parts.map(textOf).join('\n'), 400),
        basis,
      };

// The other side's messages after a question, until the asker speaks
// again, within a day; joined as one answer.
export const answerAfter = (sorted, index, isSelf) => {
  const question = sorted[index];
  const side = sideOf(question, isSelf);
  const parts = [];
  for (let i = index + 1; i < sorted.length; i += 1) {
    const next = sorted[i];
    if (timeOf(next) - timeOf(question) > DAY_MS) {
      break;
    }
    // A reply in another thread cannot settle this question.
    if (repliedId(next) && repliedId(next) !== question.id) {
      continue;
    }
    if (sideOf(next, isSelf) === side && isQuestion(textOf(next))) {
      break;
    }
    // The asker again, or the other side asking back: the answer ends.
    const asksBack = parts.length > 0 && isQuestion(textOf(next));
    if (sideOf(next, isSelf) === side || asksBack) {
      if (parts.length > 0) {
        break;
      }
      continue;
    }
    if (textOf(next)) {
      parts.push(next);
    }
    if (parts.length >= ANSWER_PARTS) {
      break;
    }
  }
  return joinedAnswer(parts);
};

export const byTime = (messages) =>
  messages
    .filter((m) => m && typeof m.body === 'string')
    .toSorted((a, b) => timeOf(a) - timeOf(b));

/**
 * Every question in the conversation with its answer (null when none
 * came within a day), oldest first: `{ question, answer, intent }`.
 */
export const questionAnswers = (
  messages = [],
  { isSelf = (s) => s === 'me' } = {}
) => {
  const sorted = byTime(messages);
  const pairs = [];
  const replies = new Map();
  for (const message of sorted) {
    const parent = repliedId(message);
    if (parent) {
      replies.set(parent, [...(replies.get(parent) ?? []), message]);
    }
  }
  sorted.forEach((message, index) => {
    if (isQuestion(textOf(message))) {
      const direct = (replies.get(message.id) ?? []).filter(
        (reply) =>
          sideOf(reply, isSelf) !== sideOf(message, isSelf) &&
          (!isQuestion(textOf(reply)) || affirmation(textOf(reply)) !== null)
      );
      pairs.push({
        question: asked(message, isSelf),
        answer: direct.length
          ? joinedAnswer(direct.slice(0, ANSWER_PARTS), 'reply')
          : answerAfter(sorted, index, isSelf),
        intent: intentOf(textOf(message)),
      });
    }
  });
  return pairs;
};
