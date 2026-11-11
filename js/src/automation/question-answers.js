import {
  asksQuestion,
  questionKey,
  questionSimilarity,
  splitQuestions,
  MAX_QUESTION_LENGTH,
} from './question-match.js';
import { matchContextualQuestion } from './question-context-match.js';
import { equivalentAnswerVariants, rejectedAnswer } from './question-policy.js';
import {
  answerRuleEligible,
  createAnswerCorrectionGuard,
} from './question-corrections.js';
import { completedAnswerSummary } from './question-summary.js';
import {
  normalizeQuestionMatching,
  normalizeMatchPage,
  rankedMatchPage,
} from './question-matching-options.js';
import { optionalAnswerProfileId } from './question-profiles.js';
import { normalizeSalary } from './salary-config.js';
import { applySalaryAnswer } from './question-salary.js';
import { questionCore, sufficientAnswer } from './question-turns.js';
import { answerModelFailure } from './answer-model-config.js';
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
  if (
    action.modelDraft !== undefined &&
    typeof action.modelDraft !== 'boolean'
  ) {
    throw answerModelFailure(
      'answer-model-config',
      'Model draft opt-in must be a boolean'
    );
  }
  const profile = normalizeAnswerProfile(action.profile);
  const profileId = optionalAnswerProfileId(action.profileId);
  return {
    kind: 'answer-questions',
    ...(action.modelDraft === undefined
      ? {}
      : { modelDraft: action.modelDraft }),
    ruleIds: strings(action.ruleIds, 'ruleIds'),
    profile,
    ...(profileId ? { profileId } : {}),
    contexts: normalizeAnswerContexts(action.contexts),
    ...(action.salary === undefined || action.salary === null
      ? {}
      : { salary: normalizeSalary(action.salary) }),
    approximate: action.approximate !== false,
    ...(action.matching === undefined
      ? {}
      : { matching: normalizeQuestionMatching(action.matching) }),
    // Generic draft/editor controls can inspect these without treating Q/A
    // edits as the next contact's reusable reengagement template.
    form: 'auto',
    templates: {},
  };
};

const ruleMatch = (rule, question, context) => {
  const core = (text) =>
    questionCore(text, { preserveCase: context.matching.caseSensitive });
  question = core(question);
  const candidates = [rule.question, ...rule.questions].map((pattern) => {
    const normalized = core(pattern);
    const match = matchContextualQuestion(normalized, question, rule, context);
    return { pattern, normalized, match, similarity: match ? 1 : 0 };
  });
  const known =
    candidates.find((entry) => entry.match === 'exact') ??
    candidates.find((entry) => entry.match === 'template');
  if (known) {
    return known;
  }
  if (context.approximate) {
    for (const candidate of candidates) {
      candidate.similarity = questionSimilarity(
        candidate.normalized,
        question,
        context.matchBudget,
        context.matching
      );
    }
  }
  candidates.sort(
    (a, b) =>
      Number(b.match === 'exact') - Number(a.match === 'exact') ||
      Number(b.match === 'template') - Number(a.match === 'template') ||
      b.similarity - a.similarity
  );
  return candidates[0];
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
  const core = questionCore(question, {
    preserveCase: input.matching.caseSensitive,
  });
  const resolved = resolveAnswerContexts(core, input);
  const environment = answerTemplateEnvironment(core, {
    ...input,
    profile: resolved.profile,
  });
  const context = { ...input, profile: environment.profile };
  const correction = createAnswerCorrectionGuard(context.rules, context);
  let matches = [];
  for (const rule of context.rules) {
    if (!answerRuleEligible(rule, context)) {
      continue;
    }
    const { match, similarity, pattern } = ruleMatch(rule, question, context);
    if (
      !match &&
      (similarity <= 0 || similarity < context.matching.threshold)
    ) {
      continue;
    }
    const canonical = rule.answers.some((answer) => answer.canonical);
    for (const answer of rule.answers) {
      if (
        !usableVariant(core, answer, canonical, context) ||
        !correction(core, answer.text, context)
      ) {
        continue;
      }
      matches.push({
        rule,
        answer,
        pattern,
        match: match ?? 'approximate',
        similarity,
      });
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
      b.answer.count - a.answer.count ||
      a.rule.id.localeCompare(b.rule.id) ||
      a.answer.text.localeCompare(b.answer.text)
  );
  const inspection = rankedMatchPage(matches, context);
  if (!matches.length) {
    return {
      question,
      text: '',
      match: 'unanswered',
      complete: false,
      requiresReview: true,
      missing: [],
      rules: [],
      ...inspection,
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
    similarity: best.similarity,
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
    ...inspection,
    alternatives: matches.slice(0, 8).map(({ rule, answer, match }) => ({
      rule: rule.id,
      text: render(answer.text, context.profile).text,
      match,
      count: answer.count,
    })),
  };
};

const answerContext = (options, rules) => ({
  profile: {},
  approximate: true,
  ...options,
  matching: normalizeQuestionMatching(options.matching),
  matchPage: normalizeMatchPage(options.matchPage),
  matchBudget:
    options.matchBudget ??
    (options.matchPage === undefined
      ? undefined
      : { remaining: 4 * 1024 ** 2, exhausted: false }),
  matchRulesLimited: (options.rules?.length ?? 0) > 1000,
  contexts: normalizeAnswerContexts(options.contexts),
  rules,
});

/** Read-only plan; the existing automation runner owns queuing and delivery. */
export const planAnswer = (question, options = {}) => {
  if (options.questionMode !== 'field' && completedAnswerSummary(question)) {
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
  const context = answerContext(options, rules);
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
  let result =
    options.questionMode === 'field' || asksQuestion(question)
      ? answerOne(question, context)
      : empty;
  const core = questionCore(question, {
    preserveCase: context.matching.caseSensitive,
  });
  const questions = splitQuestions(core);
  if (questions.length <= 1) {
    result = applySalaryAnswer(core, context, result);
  }
  if (
    ['unanswered', 'approximate'].includes(result.match) &&
    questions.length > 1
  ) {
    const parts = questions.map((part) =>
      applySalaryAnswer(part, context, answerOne(part, context))
    );
    result = {
      ...result,
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
  return {
    ...result,
    question,
    ...(options.profileSource ? { profileSource: options.profileSource } : {}),
  };
};
