import { loadPreviousModule } from './previous-module.mjs';

loadPreviousModule(
  '2a77ef49',
  'experiments/issue-56/application-answer-context-mcp-runner.mjs'
);
await import('../../js/tests/mcp-inspection-code.test.js');
