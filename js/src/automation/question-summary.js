import { asksQuestion } from './question-match.js';
import { questionProse } from './question-lists.js';
import {
  cleanSummaryLine,
  summaryHeader,
  employerQuestions,
  noEmployerQuestions,
  readSummaryPair,
} from './question-summary-layout.js';

const footerEnd = (lines, index, explicit) => {
  const line = cleanSummaryLine(lines[index]);
  if (!line || (explicit && noEmployerQuestions(line))) {
    return index + 1;
  }
  if (
    explicit &&
    employerQuestions(line) &&
    noEmployerQuestions(cleanSummaryLine(lines[index + 1] ?? ''))
  ) {
    return index + 2;
  }
  return null;
};

const consumeSummaryLine = (state, lines, index) => {
  const skipped = footerEnd(lines, index, state.explicit);
  if (skipped !== null) {
    return skipped;
  }
  const parsed = readSummaryPair(lines, index);
  if (!parsed?.closed) {
    // Unknown text may contain a new task. An unfinished code block also owns
    // its remaining lines, which must never be reparsed as quoted facts.
    state.complete = false;
    return parsed?.end ?? index + 1;
  }
  state.count++;
  state.recognized ||= asksQuestion(parsed.pair.question);
  if (state.count <= 20 && !asksQuestion(questionProse(parsed.pair.text))) {
    state.pairs.push(parsed.pair);
  }
  state.complete &&= state.count <= 20;
  return parsed.end;
};

/** Bounded marked handovers, or complete multi-pair unmarked summaries. */
const parseSummary = (text) => {
  if (typeof text !== 'string' || text.length > 12000) {
    return { pairs: [], complete: false };
  }
  const lines = text.trim().split('\n');
  const state = {
    explicit: summaryHeader(cleanSummaryLine(lines[0] ?? '')),
    pairs: [],
    count: 0,
    complete: true,
    recognized: false,
  };
  for (let index = state.explicit ? 1 : 0; index < lines.length;) {
    index = consumeSummaryLine(state, lines, index);
  }
  if (
    !state.explicit &&
    (!state.complete || state.count < 2 || !state.recognized)
  ) {
    return { pairs: [], complete: false };
  }
  return { pairs: state.pairs, complete: state.complete && state.count > 0 };
};

export const summaryAnswerPairs = (text) => parseSummary(text).pairs;
export const completedAnswerSummary = (text) => parseSummary(text).complete;
