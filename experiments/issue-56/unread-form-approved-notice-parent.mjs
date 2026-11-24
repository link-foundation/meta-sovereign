import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const parent = '6a719b770d11cb2e8bbcc1c70016e72e11a59fd5';
const sources = new Map(
  ['question-unread-answers.js', 'question-unread-form.js'].map((file) => {
    const path = `js/src/automation/${file}`;
    return [
      new URL(`../../${path}`, import.meta.url).href,
      execFileSync('git', ['show', `${parent}:${path}`], { encoding: 'utf8' }),
    ];
  })
);
registerHooks({
  load(url, context, nextLoad) {
    return sources.has(url)
      ? { format: 'module', source: sources.get(url), shortCircuit: true }
      : nextLoad(url, context);
  },
});
