import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';

// Compile actual trusted work without executing provider or browser operations.
for (const name of [
  'application-answer-context-mcp.mjs',
  'application-salary-mcp.mjs',
]) {
  const work = await readFile(new URL(name, import.meta.url), 'utf8');
  new Script(`(${applicationAnswerMcpRunner(work)})`);
  console.log(`Compiled ${name}`);
}
await import('./application-search-route-mcp-runner.mjs');
const generated = await readFile(
  'ci-logs/application-route-mcp-code.js',
  'utf8'
);
new Script(`(${generated})`);
console.log('Compiled current search-route MCP runner');
