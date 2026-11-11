// Accepted summaries are evidence for current native choices only. They never
// approve a learned fact, count as an owner send or authorize free-text reuse.
import { completedSummaryPairs } from './question-summary.js';
import { questionKey } from './question-match.js';
import { questionCore, sufficientAnswer } from './question-turns.js';
import { createAnswerCorrectionGuard } from './question-corrections.js';
import { rejectedAnswer } from './question-policy.js';
import { directSalaryQuestion } from './salary-question.js';

const validSummaryMessage = (message) =>
  message?.id?.startsWith('msg:') &&
  message.id.length <= 500 &&
  typeof message.source === 'string' &&
  message.source.length <= 80 &&
  message.chat !== undefined &&
  message.chat !== null &&
  Number.isFinite(Date.parse(message.timestamp)) &&
  typeof message.body === 'string' &&
  message.body.length <= 12000;
const incoming = (message, owners) =>
  validSummaryMessage(message) &&
  !message.deleted &&
  !message.service &&
  !message.pending &&
  !message.failed &&
  !['pending', 'sending', 'failed', 'unknown'].includes(
    message.delivery ?? message.status
  ) &&
  message.out !== true &&
  message.outgoing !== true &&
  !owners.has(String(message.sender));

/** A bounded projection, shared by archived previews and pure batch planning. */
export const createAcceptedSummaryIndex = ({
  owners = ['me'],
  maxMessages = 10000,
  maxBytes = 8 * 1024 ** 2,
  maxPairs = 1000,
} = {}) => {
  const ownerIds = new Set(['me', ...owners.map(String)]);
  const entries = [];
  const seen = new Set();
  let bytes = 0;
  let limited = false;
  return {
    accept(message) {
      if (limited || !validSummaryMessage(message) || seen.has(message.id)) {
        return;
      }
      seen.add(message.id);
      bytes += message.body.length * 2 + message.id.length * 2 + 128;
      if (seen.size > maxMessages || bytes > maxBytes) {
        limited = true;
        return;
      }
      if (
        (message.outgoing === true || message.out === true) &&
        message.sender
      ) {
        ownerIds.add(String(message.sender));
        if (ownerIds.size > 1000) {
          limited = true;
        }
      }
      if (!incoming(message, ownerIds)) {
        return;
      }
      for (const pair of completedSummaryPairs(message.body)) {
        if (entries.length >= maxPairs) {
          limited = true;
          break;
        }
        entries.push({
          ...pair,
          evidence: message.id,
          sender: String(message.sender),
        });
      }
    },
    invalidate: () => {
      limited = true;
    },
    snapshot: () => ({
      entries: entries
        .filter((entry) => !ownerIds.has(entry.sender))
        .map(({ sender: _sender, ...entry }) => entry),
      limited,
    }),
  };
};

export const acceptedSummariesFromLinks = (links, owners) => {
  const index = createAcceptedSummaryIndex({ owners });
  links.forEach(index.accept);
  return index.snapshot();
};

export const readAcceptedSummaries = async (store) => {
  const index = createAcceptedSummaryIndex();
  const stop = store.subscribe?.((event) => {
    if (event.link?.id?.startsWith('msg:')) {
      index.invalidate();
    }
  });
  const select = (message) => message?.id?.startsWith('msg:');
  try {
    if (store.scan) {
      await store.scan(
        select,
        128,
        () => {},
        (message) => {
          index.accept(message);
          return null;
        }
      );
    } else {
      (await store.query(select)).forEach(index.accept);
    }
    return index.snapshot();
  } finally {
    stop?.();
  }
};

const exactOption = (text, options) => {
  const key = questionKey(text);
  const matches = options.filter((option) => questionKey(option) === key);
  return matches.length === 1 ? matches[0] : null;
};
const summaryPairsFor = (question, input) => {
  const key = (text) => questionKey(questionCore(text), input.matching);
  return (input.acceptedSummaries?.entries ?? []).filter(
    (entry) => key(entry.question) === key(question)
  );
};
const summarySelection = (pairs, choices) => {
  const options = pairs.map((entry) => exactOption(entry.text, choices));
  const unique = new Set(options);
  return unique.size === 1 && !unique.has(null) ? options[0] : null;
};

const recoverableChoice = (question, input, answer, choices) =>
  choices.strictOptions &&
  choices.options.length > 0 &&
  input.questionMode !== 'field' &&
  !directSalaryQuestion(question) &&
  !answer.salary &&
  !(answer.complete && !answer.requiresReview);
const allowedOption = (question, option, input) =>
  Boolean(
    option &&
    !rejectedAnswer(option, input.policy) &&
    sufficientAnswer(question, option) &&
    createAnswerCorrectionGuard(input.rules, input)(question, option, input)
  );
const selectionState = (limited, allowed) =>
  limited ? 'limited' : allowed ? 'matched' : 'conflict';

export const applyAcceptedSummaryChoice = (
  question,
  input,
  answer,
  choices
) => {
  if (!recoverableChoice(question, input, answer, choices)) {
    return answer;
  }
  const index = input.acceptedSummaries;
  if (!index) {
    return answer;
  }
  const pairs = summaryPairsFor(question, input);
  if (!pairs.length && !index.limited) {
    return answer;
  }
  const option = index.limited
    ? null
    : summarySelection(pairs, choices.options);
  const allowed = allowedOption(question, option, input);
  const evidence = [...new Set(pairs.map((pair) => pair.evidence))].slice(
    0,
    100
  );
  const acceptedSummary = {
    state: selectionState(index.limited, allowed),
    evidence,
  };
  return allowed
    ? {
        ...answer,
        text: option,
        option,
        match: 'accepted-summary',
        complete: true,
        requiresReview: false,
        missing: [],
        rules: [],
        count: 0,
        evidence,
        optionMismatch: false,
        optionPending: false,
        acceptedSummary,
      }
    : { ...answer, acceptedSummary };
};
