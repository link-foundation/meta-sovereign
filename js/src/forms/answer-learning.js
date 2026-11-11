import { prepareAnswerPreview } from '../automation/question-store.js';
import { writeAnswerKnowledge } from '../automation/question-knowledge.js';
import { createAnswerPairLearner } from '../automation/question-learning.js';
import { createAnswerContractor } from '../automation/question-contraction.js';
import { mergeObservedAnswers } from '../automation/question-merge.js';
import { answerRuleEligible } from '../automation/question-corrections.js';
import { matchQuestion } from '../automation/question-match.js';
import { renderAnswer } from '../automation/question-profile.js';
import { formProfileFields } from './profile-fields.js';

const excluded = (pair) =>
  !pair.text ||
  /\[\s*(?:уточнить|clarify)|\{\{answer:/iu.test(pair.text) ||
  /test assignment|тестов\S*\s+задан|测试任务|परीक्षण कार्य/iu.test(
    pair.question
  ) ||
  /salary|compensation|hourly rate|\bpay\b|(?<!\p{L})(?:зарплат|оплат|ставк|доход|вознагражд)|финансов\S*\s+ожидан|薪资|工资|वेतन/iu.test(
    pair.question
  );

const known = (pair, context, contract) => {
  const keys = formProfileFields(
    { ...pair.field, label: pair.question },
    context.profile
  );
  if (
    keys.length &&
    contract(pair.text) === keys.map((key) => `{{${key}}}`).join(', ')
  ) {
    return true;
  }
  return context.rules.some(
    (rule) =>
      answerRuleEligible(rule, { source: 'forms', chat: pair.url }) &&
      [rule.question, ...rule.questions].some((question) =>
        matchQuestion(question, pair.question)
      ) &&
      rule.answers.some(
        (answer) =>
          contract(renderAnswer(answer.text, context.profile).text) ===
          contract(pair.text)
      )
  );
};

/** Read current policy/profile inside the shared writer queue; never approve. */
export const learnFormAnswerPairs = (
  store,
  pairs,
  { profileId = '', check = () => {} } = {}
) =>
  writeAnswerKnowledge(store, async () => {
    if (
      !Array.isArray(pairs) ||
      pairs.length > 1000 ||
      JSON.stringify(pairs).length * 2 > 2 * 1024 ** 2
    ) {
      throw new Error('Form learning capacity exceeded; no proposals applied.');
    }
    await check();
    const { context } = await prepareAnswerPreview(
      store,
      { profileId, approximate: false },
      { maxBytes: 4 * 1024 ** 2 }
    );
    const contract = createAnswerContractor({ ...context, contract: true });
    const learner = createAnswerPairLearner({ ...context, contract });
    for (const pair of pairs) {
      if (!excluded(pair) && !known(pair, context, contract)) {
        learner.add(pair.question, pair.text, [pair.evidence], 1, {
          source: 'forms',
          chat: pair.url,
        });
      }
    }
    const rules = mergeObservedAnswers(
      new Map(context.rules.map((rule) => [rule.id, rule])),
      learner.values()
    );
    const written = [];
    // Owner writes share this queue. No stale policy/profile can pass a wait.
    try {
      for (const rule of rules) {
        await check();
        await store.put(rule);
        written.push(rule.id);
      }
    } catch (error) {
      error.partial = {
        rules: written,
        approved: false,
        saved: written.reduce(
          (sum, id) =>
            sum +
            learner.values().find((rule) => rule.id === id).answers.length,
          0
        ),
      };
      throw error;
    }
    return {
      saved: rules.reduce(
        (sum, rule) =>
          sum +
          learner.values().find((entry) => entry.id === rule.id).answers.length,
        0
      ),
      skipped:
        pairs.length -
        learner.values().reduce((sum, rule) => sum + rule.answers.length, 0),
      rules: rules.map((rule) => rule.id),
      approved: false,
    };
  });
