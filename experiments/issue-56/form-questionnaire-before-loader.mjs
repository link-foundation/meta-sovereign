// Run with --import after saving the exact parent source to ci-logs.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

const target = new URL('../../js/src/forms/answer-plan.js', import.meta.url)
  .href;
const source = new URL(
  '../../ci-logs/form-questionnaire-parent.js',
  import.meta.url
);
registerHooks({
  load(url, context, next) {
    return url === target
      ? {
          format: 'module',
          source: readFileSync(source, 'utf8'),
          shortCircuit: true,
        }
      : next(url, context);
  },
});
