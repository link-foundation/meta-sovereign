import { wordEligibility, wordEligibilityAsync } from './meaningful-words.js';
import { createWorkBudget } from '../storage/work-budget.js';
import { historyLibrary } from './history-library.js';
import { normalizeMessage, extractReplyPairs } from './reply-graph.js';
import { questionAnswers } from '../crm/conversation-questions.js';

const learnedFacts = (chats, eligible, isSelf, limit) => {
  const facts = [];
  for (const list of chats.values()) {
    for (const pair of questionAnswers(list, {
      isSelf,
      questionFilter: (message) => eligible.has(message.id),
      limit: limit - facts.length,
      requireAnswer: true,
    })) {
      facts.push({
        source: list[0].source,
        chat: String(list[0].chat),
        question: pair.question.text,
        answer: pair.answer.text,
        by: pair.answer.by,
        evidence: [pair.question.id, ...(pair.answer.ids ?? [pair.answer.id])],
      });
      if (facts.length >= limit) {
        break;
      }
    }
    if (facts.length >= limit) {
      break;
    }
  }
  return facts;
};

const assembleLibrary = (
  messages,
  { isSelf, minFrequency, limit },
  { eligible, words }
) => {
  const eligibleBodies = new Set(
    messages.filter((m) => eligible.has(m.id)).map((m) => m.body)
  );
  const pairs = new Map();
  // Preserve the original adjacency and explicit replies before filtering.
  // Removing intervening messages first would invent question/reply pairs.
  for (const pair of extractReplyPairs(messages, { isSelf })) {
    if (!eligibleBodies.has(pair.prompt) && !eligibleBodies.has(pair.reply)) {
      continue;
    }
    const key = JSON.stringify([
      normalizeMessage(pair.prompt),
      normalizeMessage(pair.reply),
    ]);
    const row = pairs.get(key) ?? { ...pair, count: 0 };
    row.count++;
    pairs.set(key, row);
  }
  const sent = new Map();
  const chats = new Map();
  for (const message of messages) {
    const key = `${message.source}:${message.chat}`;
    const list = chats.get(key) ?? [];
    list.push(message);
    chats.set(key, list);
    if (!eligible.has(message.id) || !isSelf(message.sender)) {
      continue;
    }
    const normalized = normalizeMessage(message.body);
    const row = sent.get(normalized) ?? { text: message.body, count: 0 };
    row.count++;
    sent.set(normalized, row);
  }
  const facts = learnedFacts(chats, eligible, isSelf, limit);
  return {
    ...historyLibrary([...pairs.values()], [...sent.values()], limit),
    facts,
    words,
    threshold: minFrequency,
    considered: messages.length,
    eligible: eligible.size,
  };
};
export const learnedLibrary = (messages, options = {}) => {
  const settings = { minFrequency: 5, limit: 50, ...options };
  return assembleLibrary(
    messages,
    settings,
    wordEligibility(messages, settings.minFrequency)
  );
};
export const learnedLibraryAsync = async (messages, options = {}) => {
  const settings = { minFrequency: 5, limit: 50, ...options };
  const yieldWork = options.yieldWork ?? createWorkBudget({ restMs: 0 });
  const eligibility = await wordEligibilityAsync(
    messages,
    settings.minFrequency,
    yieldWork
  );
  return assembleLibrary(messages, settings, eligibility);
};
