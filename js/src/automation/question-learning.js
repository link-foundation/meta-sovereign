// Learn proposals from actual complete turns. Approval is separate from
// observed frequency; importing a conversation never authorizes sending.
import { repliedId } from '../crm/conversation-questions.js';
import { asksQuestion, questionKey, splitQuestions } from './question-match.js';
import { QA_RULE_PREFIX } from './question-answers.js';
import { rejectedAnswer } from './question-policy.js';
import { summaryAnswerPairs } from './question-summary.js';
import { historyOrder } from '../replies/history-order.js';
import {
  questionCore,
  isQuestionReminder,
  isContinuationConsent,
  isStandaloneGreeting,
  sufficientAnswer,
  debugQuestionTurn,
} from './question-turns.js';

const hash = (text) => {
  let result = 14695981039346656037n;
  for (const char of text) {
    result = BigInt.asUintN(
      64,
      (result ^ BigInt(char.codePointAt(0))) * 1099511628211n
    );
  }
  return result.toString(36);
};
const privateUrl = (text) => {
  for (const [raw] of text.matchAll(/(?:https?|tg):\/\/[^\s<>]+/giu)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return true;
    }
    if (
      url.protocol === 'tg:' ||
      url.username ||
      url.password ||
      /\/(?:invite|joinchat)(?:\/|$)|^\/\+/iu.test(url.pathname) ||
      /(?:token|key|access|auth|invite|signature|secret|session|code)/iu.test(
        [...url.searchParams.keys()].join(' ')
      ) ||
      url.hash
    ) {
      return true;
    }
  }
  return false;
};
const reusable = (text) =>
  text.length <= 12000 &&
  !/\[уточнить|\{\{answer:/iu.test(text) &&
  !privateUrl(text);

const undelivered = (message) =>
  ['pending', 'sending', 'failed', 'unknown'].includes(
    message.delivery ?? message.status
  );

const usableAnswer = (question, next, isSelf) =>
  isSelf(next) &&
  !next.deleted &&
  !next.service &&
  !next.pending &&
  !next.failed &&
  !asksQuestion(next.body) &&
  !undelivered(next) &&
  Date.parse(next.timestamp) - Date.parse(question.timestamp) <= 86400000 &&
  (!repliedId(next) || repliedId(next) === question.id);

const addAlignedParts = (question, text, evidence, add) => {
  const questions = splitQuestions(question);
  const parts = text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => line.match(/^\s*(\d{1,2})[.)]\s+(.+)$/u));
  if (
    questions.length > 1 &&
    parts.length === questions.length &&
    parts.every((part, index) => part && Number(part[1]) === index + 1)
  ) {
    questions.forEach((part, index) => add(part, parts[index][2], evidence));
  }
};

const incomingSummary = (message, isSelf) =>
  !isSelf(message) && !message.deleted && !message.service
    ? summaryAnswerPairs(message.body)
    : [];

const usableQuestion = (message, isSelf) =>
  !isSelf(message) &&
  !message.deleted &&
  !message.service &&
  asksQuestion(message.body);

const answerTarget = (question, prior, hasAnswers, message, isSelf) => {
  if (hasAnswers || !prior || !usableAnswer(prior, message, isSelf)) {
    return question;
  }
  const parent = repliedId(message);
  return parent === prior.id ||
    (!parent && !isContinuationConsent(message.body))
    ? prior
    : question;
};
const questionBeforeReminder = (
  question,
  prior,
  hasAnswers,
  message,
  isSelf
) => {
  if (
    hasAnswers ||
    !usableQuestion(message, isSelf) ||
    !isQuestionReminder(message.body)
  ) {
    return null;
  }
  const previous = prior ?? question;
  return previous &&
    Date.parse(message.timestamp) - Date.parse(previous.timestamp) <= 86400000
    ? previous
    : null;
};

const answerCollection = ({ policy, contract }) => {
  const learned = new Map();
  let bytes = 0;
  const retainEvidence = (prior, incoming) => {
    const next = [...new Set([...prior, ...incoming])].slice(0, 100);
    bytes += next
      .slice(prior.length)
      .reduce((size, id) => size + id.length * 2 + 32, 0);
    return next;
  };
  const add = (question, text, evidence, count = 1) => {
    question = questionCore(question);
    if (
      !reusable(text) ||
      rejectedAnswer(text, policy) ||
      !sufficientAnswer(question, text)
    ) {
      debugQuestionTurn('answer-excluded', { evidence });
      return;
    }
    text = contract(text);
    const key = questionKey(question);
    const group = learned.get(key) ?? {
      id: `${QA_RULE_PREFIX}${hash(key)}`,
      tokens: ['qa-rule'],
      question,
      enabled: true,
      sources: [],
      chats: [],
      answers: [],
    };
    const answer = group.answers.find((entry) => entry.text === text);
    if (answer) {
      answer.count += count;
      answer.evidence = retainEvidence(answer.evidence, evidence);
    } else {
      bytes += (question.length + text.length) * 2 + 256;
      if (learned.size >= 1000 && !learned.has(key)) {
        throw new Error(
          'answer rule limit (1000) exceeded; no proposals applied'
        );
      }
      if (group.answers.length >= 100) {
        throw new Error(
          'learned answer capacity exceeded; no proposals applied'
        );
      }
      group.answers.push({
        text,
        count,
        approved: false,
        evidence: retainEvidence([], evidence),
      });
    }
    if (bytes > 8 * 1024 ** 2) {
      throw new Error('learned answer capacity exceeded; no proposals applied');
    }
    learned.set(key, group);
  };
  return { add, values: () => [...learned.values()] };
};

// One chronological conversation at a time; retain a question, its immediate
// reminder and twenty outgoing bubbles. No unrelated turn can bridge the pair.
export const createAnswerLearner = ({
  self = ['me'],
  policy = {},
  contract = (text) => text,
} = {}) => {
  const isSelf = (message) =>
    message.out === true ||
    message.outgoing === true ||
    self.includes(message.sender);
  const collection = answerCollection({ policy, contract });
  let question;
  let priorQuestion;
  let answers = [];
  const finish = () => {
    if (question && answers.length) {
      const text = answers.map((answer) => answer.body.trim()).join('\n');
      const evidence = answers.map((answer) => answer.id);
      collection.add(question.body.trim(), text, evidence);
      addAlignedParts(question.body, text, evidence, collection.add);
    }
    question = null;
    priorQuestion = null;
    answers = [];
  };
  return {
    accept(message) {
      const target = answerTarget(
        question,
        priorQuestion,
        answers.length > 0,
        message,
        isSelf
      );
      if (target && usableAnswer(target, message, isSelf)) {
        if (isStandaloneGreeting(message.body)) {
          debugQuestionTurn('greeting-excluded', { message: message.id });
          return;
        }
        if (target !== question) {
          debugQuestionTurn('answer-before-reminder', {
            question: target.id,
            answer: message.id,
          });
        }
        question = target;
        priorQuestion = null;
        if (message.body?.trim()) {
          answers.push(message);
        }
        if (answers.length === 20) {
          finish();
        }
        return;
      }
      const previous = questionBeforeReminder(
        question,
        priorQuestion,
        answers.length > 0,
        message,
        isSelf
      );
      finish();
      const summaries = incomingSummary(message, isSelf);
      if (summaries.length) {
        for (const pair of summaries) {
          collection.add(pair.question, pair.text, [message.id], 0);
        }
      } else if (usableQuestion(message, isSelf)) {
        question = message;
        priorQuestion = previous;
      }
    },
    finishChat: finish,
    rules: () => collection.values(),
  };
};

export const learnAnswerRules = (messages, options = {}) => {
  const unique = new Map(
    messages
      .filter((message) => message?.id)
      .map((message) => [message.id, message])
  );
  const chats = new Map();
  for (const message of unique.values()) {
    const key = JSON.stringify([message.source, message.chat]);
    const list = chats.get(key) ?? [];
    list.push(message);
    chats.set(key, list);
  }
  const learner = createAnswerLearner(options);
  for (const list of chats.values()) {
    // Missing chronology cannot establish adjacency. Keep service records,
    // including those without a body, so they cannot disappear between turns.
    if (
      list.some((message) => !Number.isFinite(Date.parse(message.timestamp)))
    ) {
      continue;
    }
    for (const message of [...list].sort(historyOrder)) {
      learner.accept(message);
    }
    learner.finishChat();
  }
  return learner.rules();
};
