import { loadPreviousModule } from './previous-module.mjs';

for (const file of [
  'js/src/automation/question-salary.js',
  'js/src/automation/salary-options.js',
]) {
  loadPreviousModule('640de38b', file);
}
