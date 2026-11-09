import { asksQuestion } from './question-match.js';

const HEADER =
  /^(?:ваши ответы|итоги (?:опроса|беседы|собеседования)|your answers|(?:interview |conversation )?summary)\s*[:：]?$/iu;
const clean = (text) =>
  text
    .trim()
    .replace(/^[-•*]\s*/u, '')
    .replace(/^\*{1,2}|\*{1,2}$/gu, '')
    .trim();

const summaryPair = (line, nextLine) => {
  const inline = line.match(/^(.{1,3000}?[?？])\s*[:：—-]\s*(.+)$/u);
  const separate = line.match(/^(?:вопрос|question)\s*[:：]\s*(.+)$/iu);
  const next =
    separate && nextLine?.match(/^(?:ответ|answer)\s*[:：]\s*(.+)$/iu);
  const question = inline?.[1] ?? (next ? separate[1] : undefined);
  const answer = inline?.[2] ?? next?.[1];
  if (!question || !answer || !asksQuestion(question) || asksQuestion(answer)) {
    return null;
  }
  return {
    pair: { question: clean(question), text: clean(answer) },
    separate: Boolean(next),
  };
};

/** Parse bounded, explicitly marked bot handovers without discarding new tasks. */
const parseSummary = (text) => {
  if (typeof text !== 'string' || text.length > 12000) {
    return { pairs: [], complete: false };
  }
  const lines = text.split('\n').map(clean).filter(Boolean);
  if (!lines.length || !HEADER.test(lines[0])) {
    return { pairs: [], complete: false };
  }
  const pairs = [];
  let complete = true;
  for (let i = 1; i < lines.length; i++) {
    const parsed = summaryPair(lines[i], lines[i + 1]);
    if (pairs.length < 20 && parsed) {
      pairs.push(parsed.pair);
      if (parsed.separate) {
        i++;
      }
    } else {
      // Unparsed text may contain a new task or question. It must remain visible
      // for review instead of being dismissed as a completed questionnaire.
      complete = false;
    }
  }
  return { pairs, complete: complete && pairs.length > 0 };
};

export const summaryAnswerPairs = (text) => parseSummary(text).pairs;
export const completedAnswerSummary = (text) => parseSummary(text).complete;
