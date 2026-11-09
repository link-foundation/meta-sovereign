import {
  asksQuestion,
  matchQuestion,
  questionKey,
  questionSimilarity,
  splitQuestions,
  MAX_QUESTION_LENGTH,
} from './question-match.js';
import { equivalentAnswerVariants, rejectedAnswer } from './question-policy.js';
import { completedAnswerSummary } from './question-summary.js';
import { normalizeSalary } from './salary-config.js';
import { applySalaryAnswer } from './question-salary.js';
import { questionCore, sufficientAnswer } from './question-turns.js';
import {
  answerTemplateEnvironment,
  salaryTemplateEvidence,
} from './salary-template.js';
import {
  normalizeAnswerProfile,
  renderAnswer as render,
} from './question-profile.js';
import {
  normalizeAnswerContexts,
  resolveAnswerContexts,
} from './question-context.js';

export const QA_RULE_PREFIX = 'qa-rule:';
const MAX_ANSWER_LENGTH = 12000;
const strings = (value, field, maxLength = 500) => {
  if (value === undefined || value === null) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (item) =>
        typeof item !== 'string' || !item.trim() || item.length > maxLength
    )
  ) {
    throw new Error(`${field} must be a list of at most 100 nonempty strings`);
  }
  return [...new Set(value)];
};
export const normalizeAnswerRule = (input) => {
  if (
    !input ||
    typeof input.question !== 'string' ||
    !questionKey(input.question) ||
    input.question.length > MAX_QUESTION_LENGTH
  ) {
    throw new Error('answer rule needs a question of at most 6000 characters');
  }
  if (
    typeof input.id !== 'string' ||
    !input.id.startsWith(QA_RULE_PREFIX) ||
    !input.id.slice(QA_RULE_PREFIX.length).trim() ||
    input.id.length > 500
  ) {
    throw new Error('answer rule needs a qa-rule: identifier');
  }
  if (
    !Array.isArray(input.answers) ||
    !input.answers.length ||
    input.answers.length > 100
  ) {
    throw new Error('answer rule needs between 1 and 100 answer variants');
  }
  const answers = input.answers.map((answer) => {
    if (
      typeof answer?.text !== 'string' ||
      !answer.text.trim() ||
      answer.text.length > MAX_ANSWER_LENGTH
    ) {
      throw new Error('answer variant needs text of at most 12000 characters');
    }
    const count = answer.count ?? 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error('answer frequency must be a nonnegative integer');
    }
    return {
      text: answer.text,
      count,
      approved: answer.approved === true,
      canonical: answer.canonical === true,
      evidence: strings(answer.evidence, 'answer evidence'),
    };
  });
  if (
    !Number.isSafeInteger(
      answers.reduce((sum, answer) => sum + answer.count, 0)
    )
  ) {
    throw new Error('combined answer frequency exceeds the safe integer limit');
  }
  const questions = strings(
    input.questions,
    'equivalent questions',
    MAX_QUESTION_LENGTH
  );
  if (questions.some((question) => !questionKey(question))) {
    throw new Error('equivalent questions must contain words');
  }
  return {
    id: input.id,
    tokens: ['qa-rule'],
    question: input.question.trim(),
    questions,
    enabled: input.enabled !== false,
    sources: strings(input.sources, 'sources'),
    chats: strings(input.chats, 'chats'),
    answers,
  };
};

export const normalizeAnswerAction = (action) => {
  const profile = normalizeAnswerProfile(action.profile);
  return {
    kind: 'answer-questions',
    ruleIds: strings(action.ruleIds, 'ruleIds'),
    profile,
    contexts: normalizeAnswerContexts(action.contexts),
    ...(action.salary === undefined || action.salary === null
      ? {}
      : { salary: normalizeSalary(action.salary) }),
    approximate: action.approximate !== false,
    // Generic draft/editor controls can inspect these without treating Q/A
    // edits as the next contact's reusable reengagement template.
    form: 'auto',
    templates: {},
  };
};

const eligible = (rule, { source, chat }) =>
  rule.enabled &&
  (!rule.sources.length || rule.sources.includes(source)) &&
  (!rule.chats.length || rule.chats.includes(`${source}:${chat}`));

const ruleMatch = (rule, question, approximate) => {
  const patterns = [rule.question, ...rule.questions].map(questionCore);
  question = questionCore(question);
  const kinds = patterns.map((pattern) => matchQuestion(pattern, question));
  const match = kinds.includes('exact')
    ? 'exact'
    : kinds.includes('template')
      ? 'template'
      : null;
  const similarity = match
    ? 1
    : approximate
      ? Math.max(
          ...patterns.map((pattern) => questionSimilarity(pattern, question))
        )
      : 0;
  return { match, similarity };
};

const conflictingAnswer = (candidate, best, profile, text) =>
  candidate.match === best.match &&
  candidate.similarity === best.similarity &&
  candidate.answer.approved === best.answer.approved &&
  candidate.answer.canonical === best.answer.canonical &&
  ((candidate.answer.canonical && best.answer.canonical) ||
    candidate.answer.count === best.answer.count) &&
  render(candidate.answer.text, profile).text !== text;

const templateNeedsReview = (value) =>
  value?.approved === false || value?.contextMismatch === true;
const templateDetails = (salaryTemplates) =>
  salaryTemplates ? { salaryTemplates } : {};
const usableVariant = (question, answer, canonical, context) => {
  const text = render(answer.text, context.profile).text;
  return (
    (!canonical || answer.canonical) &&
    sufficientAnswer(question, text) &&
    !rejectedAnswer(text, context.policy)
  );
};

const answerOne = (question, input) => {
  const core = questionCore(question);
  const resolved = resolveAnswerContexts(core, input);
  const environment = answerTemplateEnvironment(core, {
    ...input,
    profile: resolved.profile,
  });
  const context = { ...input, profile: environment.profile };
  let matches = [];
  for (const rule of context.rules) {
    if (!eligible(rule, context)) {
      continue;
    }
    const { match, similarity } = ruleMatch(
      rule,
      question,
      context.approximate
    );
    if (!match && similarity < 0.78) {
      continue;
    }
    const canonical = rule.answers.some((answer) => answer.canonical);
    for (const answer of rule.answers) {
      if (!usableVariant(core, answer, canonical, context)) {
        continue;
      }
      matches.push({ rule, answer, match: match ?? 'approximate', similarity });
    }
  }
  matches = equivalentAnswerVariants(matches, context.policy);
  matches.sort(
    (a, b) =>
      Number(b.match === 'exact') - Number(a.match === 'exact') ||
      Number(a.match === 'approximate') - Number(b.match === 'approximate') ||
      Number(b.answer.canonical) - Number(a.answer.canonical) ||
      b.similarity - a.similarity ||
      Number(b.answer.approved) - Number(a.answer.approved) ||
      b.answer.count - a.answer.count
  );
  if (!matches.length) {
    return {
      question,
      text: '',
      match: 'unanswered',
      complete: false,
      requiresReview: true,
      missing: [],
      rules: [],
    };
  }
  const best = matches[0];
  const result = render(best.answer.text, context.profile);
  const salaryTemplates = salaryTemplateEvidence(best.answer.text, environment);
  const conflicting = matches.some((candidate) =>
    conflictingAnswer(candidate, best, context.profile, result.text)
  );
  return {
    question,
    contexts: resolved.contexts,
    ...result,
    ...templateDetails(salaryTemplates),
    match: best.match,
    complete: result.missing.length === 0,
    requiresReview:
      best.match === 'approximate' ||
      !best.answer.approved ||
      templateNeedsReview(salaryTemplates) ||
      conflicting ||
      result.missing.length > 0,
    rules: [best.rule.id],
    count: best.answer.count,
    evidence: best.answer.evidence,
    alternatives: matches.slice(0, 8).map(({ rule, answer, match }) => ({
      rule: rule.id,
      text: render(answer.text, context.profile).text,
      match,
      count: answer.count,
    })),
  };
};

/** Read-only plan; the existing automation runner owns queuing and delivery. */
export const planAnswer = (question, options = {}) => {
  if (completedAnswerSummary(question)) {
    return {
      question,
      text: '',
      match: 'summary',
      noReply: true,
      complete: true,
      requiresReview: false,
      missing: [],
      rules: [],
      parts: [],
    };
  }
  const rules = (options.rules ?? []).slice(0, 1000).flatMap((rule) => {
    try {
      return [normalizeAnswerRule(rule)];
    } catch {
      return [];
    }
  });
  const context = {
    profile: {},
    approximate: true,
    ...options,
    contexts: normalizeAnswerContexts(options.contexts),
    rules,
  };
  const empty = {
    question,
    text: '',
    match: 'unanswered',
    complete: false,
    requiresReview: true,
    missing: [],
    rules: [],
    parts: [],
  };
  let result = asksQuestion(question) ? answerOne(question, context) : empty;
  const core = questionCore(question);
  const questions = splitQuestions(core);
  if (questions.length <= 1) {
    result = applySalaryAnswer(core, context, result);
  }
  if (result.match === 'unanswered' && questions.length > 1) {
    const parts = questions.map((part) =>
      applySalaryAnswer(part, context, answerOne(part, context))
    );
    result = {
      question,
      text: parts
        .map((part, i) => `${i + 1}. ${part.text || `{{answer:${i + 1}}}`}`)
        .join('\n'),
      match: 'assembled',
      complete: parts.every((part) => part.complete),
      requiresReview: true,
      missing: [...new Set(parts.flatMap((part) => part.missing))],
      rules: [...new Set(parts.flatMap((part) => part.rules))],
      parts,
    };
  }
  if (Array.isArray(options.options) && options.options.length) {
    const choices = options.options.filter(
      (choice) =>
        typeof choice === 'string' &&
        questionKey(choice) === questionKey(result.text)
    );
    if (choices.length === 1 && result.complete) {
      result.text = choices[0];
    } else {
      result = {
        ...result,
        text: '',
        complete: false,
        requiresReview: true,
        optionMismatch: true,
      };
    }
  }
  return { ...result, question };
};
