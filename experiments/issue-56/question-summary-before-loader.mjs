// Reproduce the preceding commit without touching the working implementation.
// First save: git show HEAD:js/src/automation/question-summary.js >
// ci-logs/question-summary-before-source.js
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

const target = new URL(
  '../../js/src/automation/question-summary.js',
  import.meta.url
).href;
const source = new URL(
  '../../ci-logs/question-summary-before-source.js',
  import.meta.url
);
registerHooks({
  load(url, context, next) {
    if (url === target) {
      return {
        format: 'module',
        source: readFileSync(source, 'utf8'),
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});
