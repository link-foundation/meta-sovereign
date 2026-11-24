import { normalizeAnswerRule } from './question-answers.js';
import { withNoticePatterns } from './notice-pattern-learning.js';

/** Merge observed proposals without granting approval or recounting a replay. */
export const mergeObservedAnswers = (saved, proposals, maxRules = 1000) => {
  const rules = proposals.map((proposal) => {
    const existing = saved.get(proposal.id);
    const merged = {
      ...proposal,
      ...existing,
      kind: (existing ?? proposal).kind ?? 'question',
      ...(proposal.kind === 'notice'
        ? {
            learnedPatterns:
              (existing ?? proposal).kind === 'notice'
                ? (proposal.learnedPatterns ?? [])
                : [],
          }
        : {}),
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

const observedReply = ({ count, evidence }) => count > 0 && evidence.length > 0;

/** Add a native observation without discarding templates learned from older chats. */
export const mergeVisitedAnswerRules = (saved, proposals) => {
  const rules = new Map(saved);
  const observed = new Set();
  const merged = mergeObservedAnswers(saved, proposals);
  for (const [index, rule] of merged.entries()) {
    if (rule.kind === 'notice') {
      rule.learnedPatterns = saved.get(rule.id)?.learnedPatterns ?? [];
      if (proposals[index].answers.some(observedReply)) {
        observed.add(rule.id);
      }
    }
    rules.set(rule.id, rule);
  }
  const patterns = [];
  if (observed.size) {
    const notices = [...rules.values()].filter(
      (rule) => rule.kind === 'notice'
    );
    for (const rule of withNoticePatterns(notices, { observed })) {
      if (
        rule.learnedPatterns.length >
        (rules.get(rule.id).learnedPatterns?.length ?? 0)
      ) {
        patterns.push(normalizeAnswerRule(rule));
      }
    }
  }
  return { rules, merged, patterns };
};
