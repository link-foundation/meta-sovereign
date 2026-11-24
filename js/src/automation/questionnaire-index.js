// Rebuild derived views from current saved knowledge. They never become an
// independently approved answer or replace the original whole questionnaire.
import { splitQuestions } from './question-match.js';
import { splitNumberedAnswers } from './question-lists.js';
import { debugQuestionTurn } from './question-turns.js';

const capacity = () => {
  throw new Error(
    'questionnaire index capacity exceeded; no proposals applied'
  );
};

const addVariant = (component, answer, text, charge) => {
  const previous = component.answers.find((entry) => entry.text === text);
  if (previous) {
    const overlap = previous.evidence.some((id) =>
      answer.evidence.includes(id)
    );
    previous.count = overlap
      ? Math.max(previous.count, answer.count)
      : previous.count + answer.count;
    if (!Number.isSafeInteger(previous.count)) {
      capacity();
    }
    const evidence = [
      ...new Set([...previous.evidence, ...answer.evidence]),
    ].slice(0, 100);
    charge(
      evidence
        .filter((id) => !previous.evidence.includes(id))
        .reduce((sum, id) => sum + id.length * 2 + 32, 0)
    );
    previous.evidence = evidence;
    return;
  }
  charge(
    (text.length +
      component.question.length +
      answer.evidence.join('').length) *
      2 +
      256
  );
  component.answers.push({
    ...answer,
    text,
    evidence: [...answer.evidence],
    approved: false,
    canonical: false,
  });
};

export const indexQuestionnaireRules = (
  rules,
  { maxRules = 20000, maxBytes = 8 * 1024 ** 2 } = {}
) => {
  const indexed = [];
  let bytes = 0;
  const charge = (amount) => {
    bytes += amount;
    if (bytes > maxBytes) {
      capacity();
    }
  };
  for (const rule of rules) {
    if (rule.kind === 'notice' || rule.enabled === false) {
      continue;
    }
    const questions = splitQuestions(rule.question);
    if (questions.length < 2) {
      continue;
    }
    const components = questions.map((question) => ({
      ...rule,
      question,
      questions: [],
      answers: [],
      questionnaireRule: rule.id,
    }));
    for (const answer of rule.answers) {
      const parts = splitNumberedAnswers(answer.text);
      if (parts?.length !== questions.length) {
        continue;
      }
      for (const [index, text] of parts.entries()) {
        addVariant(components[index], answer, text, charge);
      }
    }
    for (const component of components) {
      if (component.answers.length) {
        if (indexed.length >= maxRules) {
          capacity();
        }
        indexed.push(component);
      }
    }
  }
  debugQuestionTurn('questionnaire-indexed', {
    rules: rules.length,
    components: indexed.length,
  });
  return indexed;
};
