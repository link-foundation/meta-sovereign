import { loadPreviousModule } from './previous-module.mjs';

for (const name of [
  'mcp-inspection-code.mjs',
  'application-answer-context-mcp-runner.mjs',
]) {
  loadPreviousModule('aa095a98', `experiments/issue-56/${name}`);
}
await import('../../js/tests/mcp-inspection-code.test.js');
