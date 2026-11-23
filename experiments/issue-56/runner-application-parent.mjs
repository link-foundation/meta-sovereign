import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const sources = new Map(
  ['js/src/cli/runner-profile.js', 'js/src/server/runner-control.js'].map(
    (name) => [
      new URL(`../../${name}`, import.meta.url).href,
      execFileSync('git', ['show', `328e5282:${name}`]),
    ]
  )
);
registerHooks({
  load(specifier, context, next) {
    return sources.has(specifier)
      ? { format: 'module', source: sources.get(specifier), shortCircuit: true }
      : next(specifier, context);
  },
});
