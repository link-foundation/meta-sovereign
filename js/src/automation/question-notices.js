// Saved passive notices use the same knowledge store as questions. A notice
// match proposes text for review; it never grants permission for a background send.
import {
  asksQuestion,
  matchQuestion,
  questionWords,
  questionSimilarity,
} from './question-match.js';

export const NO_NOTICE_REPLY = '[без ответа]';
export const noticeRuleProperties = (input, questions) => {
  if (
    input.kind !== undefined &&
    !['question', 'notice'].includes(input.kind)
  ) {
    throw new Error('answer rule kind must be question or notice');
  }
  if (
    input.kind === 'notice' &&
    [input.question, ...questions].some(asksQuestion)
  ) {
    throw new Error('a notice rule cannot contain a question or request');
  }
  if (
    input.kind !== 'notice' &&
    input.answers.some((answer) => answer.text.trim() === NO_NOTICE_REPLY)
  ) {
    throw new Error('the no-reply marker requires a notice rule');
  }
  return input.kind === 'notice' ? { kind: 'notice' } : {};
};

export const applyNoticeAnswer = (result, notice, best, conflicting) => {
  if (!notice) {
    return result;
  }
  const noReply = best.answer.text.trim() === NO_NOTICE_REPLY;
  const ready =
    noReply &&
    best.answer.approved &&
    !conflicting &&
    (best.match === 'exact' ||
      (best.match === 'template' && /…|\*|\.{3}/u.test(best.pattern)));
  return {
    ...result,
    notice: true,
    requiresReview: result.requiresReview || !ready,
    ...(noReply ? { text: '', noReply: ready, noReplyProposed: true } : {}),
  };
};
const ACTION =
  /(?<![\p{L}\p{N}])(?:send|provide|complete|fill|click|follow|book|schedule|join|interview|invitation|rejected|rejection|unfortunately|пришлите|отправьте|заполните|перейдите|созвон|собеседован[\p{L}]*|приглаша[\p{L}]*|отказ[\p{L}]*|сожалению|भेजें|भरें|साक्षात्कार|अस्वीकृत)(?![\p{L}\p{N}])|请(?:填写|发送|提供|参加)|面试|拒绝/iu;

export const passiveNotice = (text) =>
  typeof text === 'string' &&
  text.length <= 6000 &&
  questionWords(text).length > 0 &&
  !asksQuestion(text) &&
  !/https?:|www\.|tg:\/\//iu.test(text) &&
  !ACTION.test(text);

// Remove only a bounded greeting and an explicit last-line sign-off. Check
// the original message first: a question in a signature must remain a blocker.
export const noticeCore = (text) =>
  String(text ?? '')
    .trim()
    .replace(
      /^(?:здравствуйте|добрый день|добрый вечер|доброе утро|hello|hi|dear|नमस्ते|你好|您好)(?:[,，\s]+[^.!?？。！\r\n]{1,80})?[.!。！।\r\n]+\s*/iu,
      ''
    )
    .replace(
      /\n(?:с уважением|best regards|kind regards|regards|सादर|此致)[,，!！.。\s]*[^\r\n]{0,120}(?:\n[^\r\n]{1,120}){0,2}$/iu,
      ''
    )
    .trim();

export const matchNotice = (pattern, text, matching = {}) => {
  if (!passiveNotice(pattern) || !passiveNotice(text)) {
    return null;
  }
  const saved = noticeCore(pattern);
  const incoming = noticeCore(text);
  const match = matchQuestion(saved, incoming, matching);
  if (match) {
    return match;
  }
  const words = questionWords(saved, matching);
  const input = ` ${questionWords(incoming, matching).join(' ')} `;
  // Containment stays a reviewed proposal and cannot consume new questions,
  // invitations, links or requests through the original-message guard above.
  return words.length >= 5 && input.includes(` ${words.join(' ')} `)
    ? 'template'
    : null;
};

export const noticeSimilarity = (pattern, text, budget, matching) =>
  passiveNotice(pattern) && passiveNotice(text)
    ? questionSimilarity(
        noticeCore(pattern),
        noticeCore(text),
        budget,
        matching
      )
    : 0;
