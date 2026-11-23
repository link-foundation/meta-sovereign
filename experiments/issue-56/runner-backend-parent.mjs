import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const path = 'js/src/server/runner-inspection.js';
const specifier = new URL(`../../${path}`, import.meta.url).href;
const source = execFileSync('git', [
  'show',
  `a79cfdb338662b1a7de40e007fa837f92ca9de0d:${path}`,
]);
registerHooks({
  load(url, context, next) {
    return url === specifier
      ? { format: 'module', source, shortCircuit: true }
      : next(url, context);
  },
});
