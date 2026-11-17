import { loadPreviousModule } from './previous-module.mjs';

for (const path of [
  'js/src/automation/question-browser.js',
  'js/src/automation/question-browser-review.js',
  'js/src/automation/question-browser-watch.js',
  'js/src/automation/question-watch-cycle.js',
  'js/src/automation/question-browser-unread.js',
  'js/src/automation/question-unread-model.js',
  'js/src/automation/question-unread-answers.js',
]) {
  loadPreviousModule('45bb2376', path);
}
