import { loadPreviousModule } from './previous-module.mjs';

for (const path of [
  'js/src/automation/question-browser-review.js',
  'js/src/automation/question-watch-cycle.js',
  'js/src/automation/question-unread-model.js',
  'js/src/automation/question-unread-answers.js',
]) {
  loadPreviousModule('19cedfee', path);
}
