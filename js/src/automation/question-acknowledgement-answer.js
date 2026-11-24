import {
  recognizedAcknowledgement,
  savedAcknowledgementThanks,
} from './question-acknowledgement.js';
import { answerRuleEligible } from './question-corrections.js';
import { planAnswer } from './question-answers.js';
import { questionKey } from './question-match.js';
import { matchNotice, noticeCore } from './question-notices.js';

export const exactApprovedNotice = (evidence) =>
  evidence.approvedNoticeText &&
  evidence.match === 'exact' &&
  evidence.complete &&
  !evidence.noReply &&
  !evidence.learnedPattern;

const noticeTemplates = (context) =>
  context.rules
    .slice(0, 1000)
    .filter(
      (rule) => rule.kind === 'notice' && answerRuleEligible(rule, context)
    );

const recognizedExamples = (rules, language, context) => {
  const examples = new Map();
  for (const rule of rules) {
    const sample = [rule.question, ...rule.questions].find(
      (body) => recognizedAcknowledgement({ body }, context.source) === language
    );
    if (!sample) {
      continue;
    }
    const key = questionKey(noticeCore(sample), context.matching);
    const group = examples.get(key) ?? { sample, rules: [] };
    group.rules.push(rule);
    examples.set(key, group);
  }
  return examples.values();
};

const approvedThanks = (examples, language, context) => {
  const replies = new Map();
  for (const { sample, rules: candidates } of examples) {
    const answer = planAnswer(sample, { ...context, rules: candidates });
    if (
      !exactApprovedNotice(answer) ||
      !savedAcknowledgementThanks(answer.text, language)
    ) {
      continue;
    }
    const key = context.policy.punctuationEquivalent
      ? answer.text.trim().replace(/[.!]+$/u, '')
      : answer.text.trim();
    const entry = replies.get(key) ?? {
      text: answer.text,
      rules: [],
      evidence: [],
      examples: 0,
    };
    entry.examples++;
    entry.rules.push(...answer.rules);
    entry.evidence.push(...answer.evidence);
    replies.set(key, entry);
  }
  const [best, next] = [...replies.values()].sort(
    (left, right) => right.examples - left.examples
  );
  return best?.examples !== next?.examples ? best : null;
};

/** Count distinct approved examples. A tie cannot choose the owner's wording. */
export const recognizedNoticeAnswer = (question, language, context, exact) => {
  if (
    exact.match === 'exact' ||
    exact.noReplyProposed ||
    context.rules.length > 1000
  ) {
    return null;
  }
  const rules = noticeTemplates(context);
  if (
    rules.some((rule) =>
      [rule.question, ...rule.questions].some(
        (sample) => matchNotice(sample, question, context.matching) === 'exact'
      )
    )
  ) {
    return null;
  }
  const best = approvedThanks(
    recognizedExamples(rules, language, context),
    language,
    context
  );
  if (!best) {
    return null;
  }
  return {
    ...exact,
    question,
    match: 'recognizedAcknowledgement',
    text: best.text,
    rules: [...new Set(best.rules)],
    evidence: [...new Set(best.evidence)],
    recognizedAcknowledgement: true,
    complete: true,
    missing: [],
    requiresReview: true,
  };
};
