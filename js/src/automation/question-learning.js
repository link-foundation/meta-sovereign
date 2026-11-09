// Learn proposals from actual complete turns. Approval is separate from
// observed frequency; importing a conversation never authorizes sending.
import { repliedId } from '../crm/conversation-questions.js';
import { asksQuestion, questionKey, splitQuestions } from './question-match.js';
import { QA_RULE_PREFIX } from './question-answers.js';
import { rejectedAnswer } from './question-policy.js';
import { summaryAnswerPairs } from './question-summary.js';

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

const collectAnswers = (sorted, index, isSelf) => {
  const answers = [];
  for (let j = index + 1; j < sorted.length; j++) {
    const next = sorted[j];
    if (
      !isSelf(next) ||
      next.deleted ||
      next.service ||
      next.pending ||
      next.failed ||
      asksQuestion(next.body) ||
      undelivered(next) ||
      Date.parse(next.timestamp) - Date.parse(sorted[index].timestamp) >
        86400000 ||
      (repliedId(next) && repliedId(next) !== sorted[index].id)
    ) {
      break;
    }
    if (next.body?.trim()) {
      answers.push(next);
    }
    if (answers.length === 20) {
      break;
    }
  }
  return answers;
};

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

export const learnAnswerRules = (
  messages,
  { self = ['me'], policy = {} } = {}
) => {
  const isSelf = (message) =>
    message.out === true ||
    message.outgoing === true ||
    self.includes(message.sender);
  const unique = new Map(
    messages
      .filter((message) => message?.id)
      .map((message) => [message.id, message])
  );
  const chats = new Map();
  for (const message of unique.values()) {
    // Keep all intervening messages. A service/deleted record breaks adjacency.
    const key = `${message.source}:${message.chat}`;
    const list = chats.get(key) ?? [];
    list.push(message);
    chats.set(key, list);
  }
  const learned = new Map();
  const add = (question, text, evidence, count = 1) => {
    if (!reusable(text) || rejectedAnswer(text, policy)) {
      return;
    }
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
      answer.evidence = [...new Set([...answer.evidence, ...evidence])].slice(
        0,
        100
      );
    } else if (group.answers.length < 100) {
      group.answers.push({
        text,
        count,
        approved: false,
        evidence: [...evidence].slice(0, 100),
      });
    }
    learned.set(key, group);
  };
  for (const list of chats.values()) {
    // Missing chronology cannot establish adjacency. Keep service records,
    // including those without a body, so they cannot disappear between turns.
    if (
      list.some((message) => !Number.isFinite(Date.parse(message.timestamp)))
    ) {
      continue;
    }
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
    );
    for (let i = 0; i < sorted.length; i++) {
      const question = sorted[i];
      const summaries = incomingSummary(question, isSelf);
      if (summaries.length) {
        for (const pair of summaries) {
          add(pair.question, pair.text, [question.id], 0);
        }
        continue;
      }
      if (!usableQuestion(question, isSelf)) {
        continue;
      }
      const answers = collectAnswers(sorted, i, isSelf);
      if (!answers.length) {
        continue;
      }
      const text = answers.map((answer) => answer.body.trim()).join('\n');
      const evidence = answers.map((answer) => answer.id);
      add(question.body.trim(), text, evidence);
      addAlignedParts(question.body, text, evidence, add);
    }
  }
  return [...learned.values()];
};
