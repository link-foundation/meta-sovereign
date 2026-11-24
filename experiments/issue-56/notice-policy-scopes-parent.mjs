// Run the regression with the exact parent's three server modules and bundle.
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const parent = 'c9cc71433e9acd99e0370643aa784857bd6bfe49';
const sources = new Map(
  [
    'js/src/automation/question-browser-unread.js',
    'js/src/automation/question-notice-plan.js',
    'js/src/automation/question-notice-policy.js',
  ].map((path) => [
    new URL(`../../${path}`, import.meta.url).href,
    execFileSync('git', ['show', `${parent}:${path}`], { encoding: 'utf8' }),
  ])
);

registerHooks({
  load(url, context, nextLoad) {
    const source = sources.get(url);
    return source === undefined
      ? nextLoad(url, context)
      : { format: 'module', source, shortCircuit: true };
  },
});
