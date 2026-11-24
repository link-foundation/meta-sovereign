// Run only the finite spelling regression with the exact prior policy module:
// node --import ./experiments/issue-56/final-period-before.mjs --test \
//   --test-name-pattern='^observed final-period pairs' js/tests/question-final-period.test.js
import { loadPreviousModule } from './previous-module.mjs';
loadPreviousModule('c389341e', 'js/src/automation/question-policy.js');
