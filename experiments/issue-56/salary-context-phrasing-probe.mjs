import { planAnswer } from '../../js/src/automation/question-answers.js';
import {
  clarificationSalary as salary,
  salaryAnchor,
} from './salary-clarification-fixture.mjs';

// A finite vocabulary audit; no browser, network or provider effects.
for (const question of [
  'Could you provide the numbers in USD gross?',
  'Please provide the figure in USD gross.',
  'Alex, could you provide the amount in USD gross?',
  'Алексей, уточни, пожалуйста, сумму в USD до вычета налогов?',
  'Мария, укажите цифры в USD gross?',
  'Напишите сумму в USD gross?',
  'Какая сумма в USD gross?',
  'Можно сумму в USD gross?',
  'Уточните сумму в USD gross?',
  'Please provide the budget numbers in USD gross.',
  'Alex, could you provide your GitHub profile in USD?',
  'Какая выручка в USD gross?',
  'Уточните сумму расходов в USD gross?',
]) {
  const plan = planAnswer(question, { salary, recent: [salaryAnchor] });
  console.log(JSON.stringify({ question, match: plan.match, text: plan.text }));
}
