import { createAnswerPairLearner } from './question-learning.js';
import { indexQuestionnaireRules } from './questionnaire-index.js';
import { answerKeyHash } from './answer-key-hash.js';

// Saved wording supplies zero new observations. Only the existing chronological
// archive learner can supply sent occurrences, using the same stable IDs.
export const savedQuestionnaireProposals = (rules, options) => {
  const groups = new Map();
  for (const rule of indexQuestionnaireRules(rules)) {
    const sources = [...rule.sources].sort();
    const chats = [...rule.chats].sort();
    const key = JSON.stringify([sources, chats]);
    let group = groups.get(key);
    if (!group) {
      group = {
        sources,
        chats,
        learner: createAnswerPairLearner({ ...options, rules }),
      };
      groups.set(key, group);
    }
    for (const answer of rule.answers) {
      group.learner.add(rule.question, answer.text, [], 0);
    }
  }
  const proposals = [];
  let bytes = 0;
  for (const [key, { learner, sources, chats }] of groups) {
    for (const rule of learner.values()) {
      const proposal = {
        ...rule,
        id:
          sources.length || chats.length
            ? `${rule.id}:scope:${answerKeyHash(key)}`
            : rule.id,
        sources,
        chats,
      };
      bytes += JSON.stringify(proposal).length * 2;
      if (bytes > 8 * 1024 ** 2 || proposals.length >= 1000) {
        throw new Error(
          'questionnaire backfill capacity exceeded; no proposals applied'
        );
      }
      proposals.push(proposal);
    }
  }
  return proposals;
};
