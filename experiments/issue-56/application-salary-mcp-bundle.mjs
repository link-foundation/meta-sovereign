import { readFile, writeFile } from 'node:fs/promises';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';
const work = await readFile(
  new URL('./application-salary-mcp.mjs', import.meta.url),
  'utf8'
);
await writeFile(
  new URL('../../ci-logs/application-salary-mcp-runner.js', import.meta.url),
  applicationAnswerMcpRunner(work)
);
