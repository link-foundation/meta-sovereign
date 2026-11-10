import { questionProse } from './question-lists.js';
import { asksQuestion } from './question-match.js';

const QUESTION = /^(?:вопрос|question|प्रश्न|问题|問題)\s*[:：]\s*(.+)$/iu;
const ANSWER = /^(?:ответ|answer|उत्तर|回答|答案)\s*[:：]\s*(.*)$/iu;
const TRAILING_ANSWER =
  /^(.{1,3000}?)\s+(?:ответ|answer|उत्तर|回答|答案)\s*[:：]\s*(.*)$/iu;

export const cleanSummaryLine = (line) =>
  line
    .trim()
    .replace(/^(?:[-•*]|\d{1,2}[.)])\s+/u, '')
    .replace(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replace(/^\*([^*\n]+)\*$/u, '$1')
    .replace(/^_([^_\n]+)_$/u, '$1')
    .trim();

export const summaryHeader = (line) =>
  /^(?:ваши ответы|итоги (?:опроса|беседы|собеседования)|в разговоре с кандидатом я узнал|your answers|(?:interview |conversation )?summary|in (?:my )?(?:conversation|interview) with (?:the )?candidate,? I learned|आपके उत्तर|बातचीत का सारांश|उम्मीदवार से बातचीत में मुझे पता चला|您的回答|对话总结|与候选人的交谈中我了解到)\s*[:：]?$/iu.test(
    line
  );

export const employerQuestions = (line) =>
  /^(?:вопросы к работодателю(?:, на которые помощник не смог ответить)?|questions for the employer|नियोक्ता के लिए प्रश्न|向雇主提出的问题)\s*[:：]?$/iu.test(
    line
  );

export const noEmployerQuestions = (line) =>
  /^(?:вопросов(?: к работодателю)? не было|no questions(?: for the employer)?|none|कोई प्रश्न नहीं|没有问题)[.!。]?$/iu.test(
    line
  );

const inlinePair = (line, labelledOnly = false) => {
  const labelled = line.match(TRAILING_ANSWER);
  if (labelledOnly && !labelled) {
    return null;
  }
  const match =
    labelled ??
    line.match(/^(.{1,3000}?[?？])\s*[:：—-]\s*(.+)$/u) ??
    line.match(/^([^:：]{1,3000})\s*[:：]\s*(.+)$/u);
  if (
    !match ||
    (!labelled &&
      !asksQuestion(match[1]) &&
      !/^(?:опыт(?:\s|$)|уровень\s|experience(?:\s|$)|(?:your\s+)?(?:english|language)\s+level)/iu.test(
        match[1]
      ))
  ) {
    return null;
  }
  return { question: match[1], text: match[2] };
};

const skipBlank = (lines, index) => {
  while (index < lines.length && !lines[index].trim()) {
    index++;
  }
  return index;
};

const reserved = (line) =>
  QUESTION.test(line) ||
  ANSWER.test(line) ||
  summaryHeader(line) ||
  employerQuestions(line) ||
  noEmployerQuestions(line);

/** Labels establish association; continuation never crosses another label. */
export const readSummaryPair = (lines, index) => {
  const line = cleanSummaryLine(lines[index]);
  const labelled = line.match(QUESTION);
  let pair = inlinePair(labelled?.[1] ?? line, Boolean(labelled));
  let end = skipBlank(lines, index + 1);
  if (!pair && labelled) {
    const answer = cleanSummaryLine(lines[end] ?? '').match(ANSWER);
    if (!answer) {
      return null;
    }
    pair = { question: labelled[1], text: answer[1] };
    end = skipBlank(lines, end + 1);
  }
  if (!pair) {
    return null;
  }
  pair.question = cleanSummaryLine(pair.question);
  pair.text = cleanSummaryLine(pair.text);
  if (!pair.text) {
    const candidate = cleanSummaryLine(lines[end] ?? '');
    if (!candidate || reserved(candidate)) {
      return null;
    }
    pair.text = candidate;
    end++;
  }
  while (questionProse(pair.text) === null && end < lines.length) {
    pair.text += `\n${lines[end++]}`;
  }
  return {
    pair,
    end,
    closed: questionProse(pair.text) !== null,
  };
};
