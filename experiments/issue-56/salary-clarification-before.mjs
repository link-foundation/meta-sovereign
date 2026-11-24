import { loadPreviousModule } from './previous-module.mjs';

for (const file of [
  'js/src/automation/salary-question.js',
  'js/src/automation/question-answers.js',
  'js/src/automation/question-salary.js',
]) {
  loadPreviousModule('deacbb7d', file);
}
