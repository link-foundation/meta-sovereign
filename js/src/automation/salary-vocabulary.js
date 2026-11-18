// Learn topic vocabulary from distinct, eligible owner-approved monthly answers.
import { answerRuleEligible } from './question-corrections.js';
import { questionKey } from './question-match.js';
import { rejectedAnswer } from './question-policy.js';

const tokens = (text) =>
  new Set(
    (
      text
        .normalize('NFKC')
        .toLowerCase()
        .replaceAll('ё', 'е')
        .match(/\p{L}{4,}/gu) ?? []
    ).map((word) => [...word].slice(0, 6).join(''))
  );
const category = (rule, policy) => {
  const canonical = rule.answers.some((answer) => answer.canonical);
  const answers = rule.answers.filter(
    (answer) =>
      answer.approved &&
      (!canonical || answer.canonical) &&
      !rejectedAnswer(answer.text, policy)
  );
  if (
    !answers.length ||
    answers.some(
      (answer) =>
        !/\{\{salary_(?:net|gross)(?:_[a-z0-9]+)?\}\}/u.test(answer.text) ||
        /\{\{salary_(?:net|gross)_hourly(?:_[a-z0-9]+)?\}\}/u.test(answer.text)
    )
  ) {
    return 'other';
  }
  const bases = new Set(
    answers.map((answer) =>
      /\{\{salary_gross(?:_[a-z0-9]+)?\}\}/u.test(answer.text) ? 'gross' : 'net'
    )
  );
  return bases.size === 1 ? [...bases][0] : 'salary';
};
const add = (counts, text, category) => {
  for (const token of tokens(text)) {
    const count = counts.get(token) ?? {
      salary: 0,
      gross: 0,
      net: 0,
      other: 0,
    };
    count[category]++;
    if (category === 'gross' || category === 'net') {
      count.salary++;
    }
    counts.set(token, count);
  }
};
export const learnSalaryVocabulary = (rules, context, eligible) => {
  const questions = new Map();
  for (const rule of rules) {
    if (
      rule.kind === 'notice' ||
      !answerRuleEligible(rule, context) ||
      /[…*]|\.\.\./u.test(rule.question)
    ) {
      continue;
    }
    const key = questionKey(rule.question);
    const label = eligible(rule.question)
      ? category(rule, context.policy)
      : 'other';
    const existing = questions.get(key);
    // Duplicate/conflicting records cannot manufacture independent examples.
    questions.set(key, {
      text: rule.question,
      category: existing && existing.category !== label ? 'other' : label,
    });
  }
  const counts = new Map();
  for (const { text, category } of questions.values()) {
    add(counts, text, category);
  }
  const salary = new Set();
  const gross = new Set();
  for (const [token, count] of counts) {
    if (
      count.salary >= 3 &&
      count.salary / (count.salary + count.other) >= 0.9
    ) {
      salary.add(token);
    }
    if (count.gross >= 3 && count.gross / (count.gross + count.net) >= 0.9) {
      gross.add(token);
    }
  }
  return { salary, gross };
};
export const learnedSalaryTopic = (text, vocabulary) =>
  [...tokens(text)].filter((token) => vocabulary?.salary.has(token)).length >=
  2;
export const learnedSalaryGross = (text, vocabulary) =>
  [...tokens(text)].some((token) => vocabulary?.gross.has(token));
