import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const name = 'js/src/server/runner-control.js';
const url = new URL(`../../${name}`, import.meta.url).href;
const source = execFileSync('git', ['show', `c81c40b5:${name}`]);
registerHooks({
  load(specifier, context, next) {
    return specifier === url
      ? { format: 'module', source, shortCircuit: true }
      : next(specifier, context);
  },
});
