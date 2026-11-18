import { readFile, writeFile } from 'node:fs/promises';
import { publishedWebBundle } from './published-web-bundle.mjs';
import { applicationAnswerMcpRunner } from './application-answer-context-mcp-runner.mjs';

await writeFile(
  new URL(
    '../../ci-logs/application-answer-context-before.min.js',
    import.meta.url
  ),
  await publishedWebBundle('e940cb62', ['js/src/web/application-panel.js'])
);

const work = await readFile(
  new URL('./application-answer-context-mcp.mjs', import.meta.url),
  'utf8'
);
await writeFile(
  new URL(
    '../../ci-logs/application-answer-context-mcp-runner.js',
    import.meta.url
  ),
  applicationAnswerMcpRunner(work)
);
