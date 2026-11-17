// Reuse approved salary-only wording without retaining its old currency or sums.
import { answerTemplateEnvironment } from './salary-template.js';
import { renderAnswer } from './question-profile.js';
import { rejectedAnswer, equivalentAnswerVariants } from './question-policy.js';
import { equivalentWordedAnswers } from './question-equivalents.js';
import {
  answerRuleEligible,
  createAnswerCorrectionGuard,
} from './question-corrections.js';
import {
  directSalaryQuestion,
  salaryBasis,
  salaryPeriod,
} from './salary-question.js';

const payField = /\{\{salary_(net|gross)(_hourly)?(?:_[a-z0-9]+)?\}\}/gu;
const vocabulary = new Set(
  'от в месяц ежемесячно час на руки до вычета ндфл налогов from net gross per month monthly hour hourly salary before after taxes tax a'.split(
    ' '
  )
);
const shape = (text) => {
  const fields = [...text.matchAll(payField)];
  if (!fields.length) {
    return null;
  }
  const rest = text.replace(payField, '').replaceAll('{{salary_tax}}', '');
  const words = rest.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (
    /[\d{}]/u.test(rest) ||
    words.some((word) => !vocabulary.has(word)) ||
    new Set(fields.map((field) => Boolean(field[2]))).size !== 1
  ) {
    return null;
  }
  const basis = fields.some((field) => field[1] === 'gross') ? 'gross' : 'net';
  const both = new Set(fields.map((field) => field[1])).size === 2;
  const period = fields[0][2] ? 'hour' : 'month';
  const statedPeriod = salaryPeriod(rest);
  const statedBasis = salaryBasis(rest);
  if (
    (statedPeriod && statedPeriod !== period) ||
    (!both && statedBasis && statedBasis !== basis)
  ) {
    return null;
  }
  return {
    basis,
    period,
    language: /[а-яё]/iu.test(rest) ? 'ru' : 'en',
    both,
    detail:
      new Set(fields.map((field) => field[1])).size +
      Number(Boolean(statedPeriod)) +
      Number(
        /на\s+руки|\b(?:net|gross|before|after)\b|до\s+вычета/iu.test(rest)
      ),
  };
};
const compatible = (item, selected) =>
  item &&
  item.period === selected.period &&
  item.language === selected.language &&
  (selected.basis === 'both' ? item.both : item.basis === selected.basis);
const variants = (rule, policy) => {
  const canonical = rule.answers.some((answer) => answer.canonical);
  const matches = rule.answers
    .filter((answer) => answer.approved && (!canonical || answer.canonical))
    .map((answer) => ({ rule, answer }));
  return equivalentAnswerVariants(equivalentWordedAnswers(matches), policy);
};
const renderedWording = (answer, environment, policy) => {
  const template = answer.text.replace(
    payField,
    (_, basis, hourly) => `{{salary_${basis}${hourly ?? ''}}}`
  );
  const rendered = renderAnswer(
    template.replaceAll('{{salary_tax}}', 'налогов'),
    environment.profile
  );
  return rendered.missing.length ||
    rejectedAnswer(answer.text, policy) ||
    rejectedAnswer(rendered.text, policy)
    ? null
    : rendered.text;
};
const variantIndex = (question, size) => {
  let result = 0;
  for (const letter of question) {
    result = (Math.imul(result, 33) ^ letter.codePointAt(0)) >>> 0;
  }
  return result % size;
};
const retainChoice = (state, choice, previous) => {
  if (
    previous.match === 'exact' &&
    previous.rules.includes(choice.rule) &&
    choice.originalText === previous.text
  ) {
    state.exact = choice;
  }
  if (choice.detail > state.detail) {
    state.detail = choice.detail;
    state.choices.clear();
    state.limited = false;
  }
  if (choice.detail !== state.detail) {
    return;
  }
  if (state.choices.size < 100 || state.choices.has(choice.text)) {
    state.choices.set(choice.text, choice);
  } else {
    state.limited = true;
  }
};
const candidates = (question, input, selected, environment, previous) => {
  const guard = createAnswerCorrectionGuard(input.rules, {
    ...input,
    profile: environment.profile,
  });
  const state = { choices: new Map(), detail: -1, limited: false, exact: null };
  for (const rule of input.rules) {
    if (
      rule.kind === 'notice' ||
      !answerRuleEligible(rule, input) ||
      !directSalaryQuestion(rule.question, input.salaryVocabulary)
    ) {
      continue;
    }
    for (const { answer, preferenceConflict } of variants(rule, input.policy)) {
      const item = shape(answer.text);
      if (!compatible(item, selected) || !guard(question, answer.text, input)) {
        continue;
      }
      const text = renderedWording(answer, environment, input.policy);
      if (text) {
        retainChoice(
          state,
          {
            text,
            rule: rule.id,
            detail: item.detail,
            requiresReview: preferenceConflict === true,
            originalText: renderAnswer(answer.text, environment.profile).text,
          },
          previous
        );
      }
    }
  }
  return state;
};

export const salaryWording = (question, input, previous, selection) => {
  if (input.options?.length || !input.rules?.length) {
    return null;
  }
  const environment = answerTemplateEnvironment(question, input);
  const { choices, exact, limited } = candidates(
    question,
    input,
    selection,
    environment,
    previous
  );
  if (exact) {
    return { ...exact, requiresReview: previous.requiresReview };
  }
  const sorted = [...choices.values()].sort((a, b) =>
    a.text.localeCompare(b.text)
  );
  if (!sorted.length) {
    return null;
  }
  const chosen = sorted[variantIndex(question, sorted.length)];
  return { ...chosen, requiresReview: chosen.requiresReview || limited };
};
