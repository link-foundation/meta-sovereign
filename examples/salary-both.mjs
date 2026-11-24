// Owner-supplied fixture targets; this read-only preview sends no messages.
import { planAnswer } from '../js/src/automation/question-answers.js';

const salary = {
  enabled: true,
  approved: false,
  defaultCurrency: 'USD',
  currencies: [{ code: 'USD', keywords: ['USD', '$'], net: 6000, gross: 7100 }],
};
for (const question of [
  'What salary in USD net and gross do you expect?',
  'What hourly salary in USD net and gross do you expect?',
]) {
  const answer = planAnswer(question, { salary });
  console.log(
    JSON.stringify({
      question,
      text: answer.text,
      requiresReview: answer.requiresReview,
    })
  );
}
