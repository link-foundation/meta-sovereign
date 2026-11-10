import { normalizeAnswerRule } from './question-answers.js';

/** Merge observed proposals without granting approval or recounting a replay. */
export const mergeObservedAnswers = (saved, proposals, maxRules = 1000) => {
  const rules = proposals.map((proposal) => {
    const existing = saved.get(proposal.id);
    const merged = {
      ...proposal,
      ...existing,
      answers: [...(existing?.answers ?? [])],
    };
    for (const answer of proposal.answers) {
      const prior = merged.answers.find((entry) => entry.text === answer.text);
      if (prior) {
        const at = merged.answers.indexOf(prior);
        merged.answers[at] = {
          ...prior,
          count: Math.max(prior.count, answer.count),
          evidence: [...new Set([...prior.evidence, ...answer.evidence])].slice(
            0,
            100
          ),
        };
      } else if (merged.answers.length < 100) {
        merged.answers.push(answer);
      } else {
        throw new Error(
          'answer variant limit (100) exceeded; no proposals applied'
        );
      }
    }
    return normalizeAnswerRule(merged);
  });
  if (
    new Set([...saved.keys(), ...rules.map((rule) => rule.id)]).size > maxRules
  ) {
    throw new Error('answer rule limit (1000) exceeded; no proposals applied');
  }
  return rules;
};
