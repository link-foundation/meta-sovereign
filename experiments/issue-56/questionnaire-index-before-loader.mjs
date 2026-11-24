// Exact parent modules are saved from git before starting this finite fixture.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

const sources = new Map(
  ['question-answers', 'question-store'].map((name) => [
    new URL(`../../js/src/automation/${name}.js`, import.meta.url).href,
    new URL(
      `../../ci-logs/questionnaire-index-parent-${name}.js`,
      import.meta.url
    ),
  ])
);
registerHooks({
  load(url, context, next) {
    return sources.has(url)
      ? {
          format: 'module',
          source: readFileSync(sources.get(url), 'utf8'),
          shortCircuit: true,
        }
      : next(url, context);
  },
});
