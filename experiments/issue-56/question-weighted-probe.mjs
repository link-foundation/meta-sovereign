import { questionSimilarity } from '../../js/src/automation/question-match.js';
import { questionCore } from '../../js/src/automation/question-turns.js';
import { weightedQuestions } from './question-weighted-fixture.mjs';

for (const [a, b] of [
  [weightedQuestions.saved, weightedQuestions.asked],
  [
    'Какие ваши зарплатные ожидания?',
    'Поделитесь вашими зарплатными ожиданиями?',
  ],
  ['Which CITY?', 'Which city?'],
]) {
  console.log(
    JSON.stringify({
      a,
      b,
      core: [questionCore(a), questionCore(b)],
      ordered: questionSimilarity(a, b),
      weighted: questionSimilarity(a, b, undefined, { algorithm: 'weighted' }),
      coreWeighted: questionSimilarity(
        questionCore(a),
        questionCore(b),
        undefined,
        { algorithm: 'weighted' }
      ),
    })
  );
}
