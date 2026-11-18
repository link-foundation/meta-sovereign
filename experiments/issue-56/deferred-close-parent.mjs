import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

const revision = '3ca58536df184607163e2fba848958fa127b7555';
const original = execFileSync(
  'git',
  ['show', `${revision}:js/tests/helpers/e2e-deferred-questions.mjs`],
  { encoding: 'utf8' }
);
const block = original.match(
  / {4}const closed = owned\.waitForEvent\('close'\);\n {4}await policy\.locator\('\[data-deferred-question-save\]'\)\.click\(\);\n {4}await closed;/
)?.[0];
if (!block) {
  throw new Error('Exact published activation/closure block is missing');
}
const target = new URL(
  '../../js/tests/helpers/native-action-close.mjs',
  import.meta.url
).href;
registerHooks({
  load(url, context, nextLoad) {
    if (url !== target) {
      return nextLoad(url, context);
    }
    return {
      format: 'module',
      shortCircuit: true,
      source: `export const activateAndWaitForClose = async (owned, activate) => {
      const policy = { locator: () => ({ click: activate }) };
      ${block}
    };`,
    };
  },
});
await import('../../js/tests/native-action-close.test.js');
