import { loadPreviousModule } from './previous-module.mjs';

for (const path of [
  'js/src/sources/browser-answer-context.js',
  'js/src/automation/question-context.js',
  'js/src/automation/salary-question.js',
]) {
  loadPreviousModule('027b8575', path);
}
