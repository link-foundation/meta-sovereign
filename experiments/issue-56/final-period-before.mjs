// Run only the finite spelling regression with the exact prior policy module:
// node --import ./experiments/issue-56/final-period-before.mjs --test \
//   --test-name-pattern='^observed final-period pairs' js/tests/question-final-period.test.js
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const policy = new URL(
  '../../js/src/automation/question-policy.js',
  import.meta.url
).href;
const source = execFileSync(
  'git',
  ['show', 'c389341e:js/src/automation/question-policy.js'],
  { encoding: 'utf8', maxBuffer: 128 * 1024 }
);
registerHooks({
  load(url, context, nextLoad) {
    return url === policy
      ? { format: 'module', source, shortCircuit: true }
      : nextLoad(url, context);
  },
});
