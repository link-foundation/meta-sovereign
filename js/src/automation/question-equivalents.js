import { debugQuestionTurn } from './question-turns.js';

// These are owner-declared literal spellings, never inferred paraphrases.
export const answerSpellings = (answer) => [
  answer.text,
  ...(answer.equivalents ?? []),
];

export const normalizeAnswerEquivalents = (value) => {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some(
      (text) => typeof text !== 'string' || !text.trim() || text.length > 12000
    )
  ) {
    throw new Error(
      'equivalent answers must contain at most 100 nonempty literal texts of 12000 characters'
    );
  }
  return [...new Set(value)];
};

export const validateAnswerEquivalents = (answers) => {
  const claims = new Map();
  const declarations = answers.filter((answer) => answer.equivalents?.length);
  const aliases = declarations.flatMap((answer) => answer.equivalents);
  if (
    aliases.length > 100 ||
    aliases.reduce((sum, text) => sum + text.length, 0) > 120000
  ) {
    throw new Error('equivalent answers exceed the per-rule limit');
  }
  for (const answer of declarations) {
    const target = JSON.stringify([
      answer.text,
      answer.approved,
      answer.canonical,
    ]);
    for (const text of answerSpellings(answer)) {
      if (claims.has(text) && claims.get(text) !== target) {
        throw new Error(
          'equivalent answer declarations must have one unambiguous preferred wording'
        );
      }
      claims.set(text, target);
    }
  }
};

export const combineAnswerObservations = (preferred, variants) => {
  const evidence = new Set();
  for (const { answer } of variants) {
    for (const id of answer.evidence) {
      if (answer.count > 0 && evidence.has(id)) {
        debugQuestionTurn('answer-observation-overlap', {
          variants: variants.length,
        });
        return variants.map((match) => ({
          ...match,
          preferenceConflict: true,
        }));
      }
      if (answer.count > 0) {
        evidence.add(id);
      }
    }
  }
  const count = variants.reduce((sum, { answer }) => sum + answer.count, 0);
  if (!Number.isSafeInteger(count)) {
    throw new Error('combined answer frequency exceeds the safe integer limit');
  }
  debugQuestionTurn('equivalent-answer-wording', {
    rule: preferred.rule.id,
    variants: variants.length,
    observations: count,
  });
  return [
    {
      ...preferred,
      answer: {
        ...preferred.answer,
        count,
        evidence: [
          ...new Set(variants.flatMap(({ answer }) => answer.evidence)),
        ].slice(0, 100),
      },
    },
  ];
};

const declaredTargets = (matches) => {
  const targets = new Map();
  const claims = new Map();
  for (const match of matches) {
    if (!match.answer.equivalents?.length) {
      continue;
    }
    const target = JSON.stringify([
      match.answer.text,
      match.answer.approved,
      match.answer.canonical,
    ]);
    targets.set(target, targets.get(target) ?? match);
    for (const text of answerSpellings(match.answer)) {
      if (claims.has(text) && claims.get(text) !== target) {
        return null;
      }
      claims.set(text, target);
    }
  }
  return { targets, claims };
};

const resolveGroup = (matches) => {
  const declared = declaredTargets(matches);
  if (!declared) {
    return matches.map((entry) => ({ ...entry, preferenceConflict: true }));
  }
  const { targets, claims } = declared;
  const buckets = new Map();
  const unchanged = [];
  for (const match of matches) {
    const target = claims.get(match.answer.text);
    if (target === undefined) {
      unchanged.push(match);
    } else {
      const bucket = buckets.get(target) ?? [];
      bucket.push(match);
      buckets.set(target, bucket);
    }
  }
  return [
    ...unchanged,
    ...[...buckets].flatMap(([target, variants]) =>
      combineAnswerObservations(targets.get(target), variants)
    ),
  ];
};

export const answerMatchBoundary = ({ match, rule }) =>
  match === 'exact' ? 'exact' : rule.id;

const groupedMatches = (matches) => {
  const groups = new Map();
  for (const match of matches) {
    // Exact matches already refer to this question and passed source/chat guards.
    // Template and approximate matches retain their individual rule boundary.
    const key = answerMatchBoundary(match);
    const group = groups.get(key) ?? [];
    group.push(match);
    groups.set(key, group);
  }
  return [...groups.values()];
};

// An unusable target cannot silently remove a competing owner declaration.
export const conflictingAnswerWordings = (matches) =>
  groupedMatches(matches).some((group) => declaredTargets(group) === null);

export const equivalentWordedAnswers = (matches) =>
  groupedMatches(matches).flatMap(resolveGroup);
