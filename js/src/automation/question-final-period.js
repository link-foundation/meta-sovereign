import { debugQuestionTurn } from './question-turns.js';

export const normalizeAnswerFinalPeriod = (value = 'with') => {
  if (!['with', 'without'].includes(value)) {
    throw new Error('answer final period must be with or without');
  }
  return value;
};

// Resolve an existing spelling pair, never punctuation in a lone observation.
// Keep raw variants in storage so learning can replay without recounting them.
export const finalPeriodMatches = (matches, preference) => {
  const style = normalizeAnswerFinalPeriod(preference);
  const groups = new Map();
  for (const match of matches) {
    const { rule, answer } = match;
    const key = JSON.stringify([rule.id, answer.approved, answer.canonical]);
    const group = groups.get(key) ?? new Map();
    group.set(answer.text, [...(group.get(answer.text) ?? []), match]);
    groups.set(key, group);
  }
  const replacements = new Map();
  for (const group of groups.values()) {
    for (const [text, dotted] of group) {
      if (!/[^.!?…]\.$/u.test(text)) {
        continue;
      }
      const plain = group.get(text.slice(0, -1));
      if (!plain) {
        continue;
      }
      const preferred = (style === 'with' ? dotted : plain)[0];
      const variants = [...plain, ...dotted];
      const count = variants.reduce(
        (sum, match) => sum + match.answer.count,
        0
      );
      if (!Number.isSafeInteger(count)) {
        throw new Error(
          'combined answer frequency exceeds the safe integer limit'
        );
      }
      const combined = {
        ...preferred,
        answer: {
          ...preferred.answer,
          count,
          evidence: [
            ...new Set(variants.flatMap((match) => match.answer.evidence)),
          ].slice(0, 100),
        },
      };
      debugQuestionTurn('final-period-pair', {
        rule: preferred.rule.id,
        observations: count,
        variants: variants.length,
        preference: style,
      });
      for (const variant of variants) {
        replacements.set(variant, combined);
      }
    }
  }
  return [...new Set(matches.map((match) => replacements.get(match) ?? match))];
};
