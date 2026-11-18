import { loadPreviousModule } from './previous-module.mjs';
const parent = '0e676ed071a1042ffa6bc50c28a2ff32f873e496';
for (const stem of ['question-final-period', 'question-policy']) {
  loadPreviousModule(parent, `js/src/automation/${stem}.js`);
}
