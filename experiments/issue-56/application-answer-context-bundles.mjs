import { readFile, writeFile } from 'node:fs/promises';
import { publishedWebBundle } from './published-web-bundle.mjs';
import { applicationPanelBrowser } from '../../js/tests/helpers/application-panel-browser.mjs';
import { configureApplicationAnswerContext } from './application-answer-context-ui.mjs';
import { applicationAnswerSalary } from './application-answer-context-fixture.mjs';
import { translate } from '../../js/src/web/i18n.js';

await writeFile(
  new URL(
    '../../ci-logs/application-answer-context-before.min.js',
    import.meta.url
  ),
  await publishedWebBundle('e940cb62', ['js/src/web/application-panel.js'])
);

// MCP evaluates a function in a VM without module imports. Embed the same
// browser helpers and their finite data rather than duplicating UI operations.
const keys = [
  'sharedLoad',
  'sharedSelect',
  'shared.id',
  'salaryEnabled',
  'salaryApproved',
  'salaryHours',
  'salaryAdd',
  'salaryCode',
  'salaryKeywords',
  'salary.net',
  'salary.gross',
  'salaryDefault',
];
const labels = Object.fromEntries(
  keys.map((key) => [`questions.${key}`, translate('en', `questions.${key}`)])
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
  `async (page) => {
  const assert = { equal(a, b) { if (a !== b) throw new Error('Browser assertion failed'); } };
  const translate = (_locale, key) => (${JSON.stringify(labels)})[key];
  const applicationAnswerSalary = ${JSON.stringify(applicationAnswerSalary)};
  const applicationPanelBrowser = ${applicationPanelBrowser.toString()};
  const configureApplicationAnswerContext = ${configureApplicationAnswerContext.toString()};
  return (${work.trim().replace(/;$/u, '')})(page, applicationPanelBrowser, configureApplicationAnswerContext);
}`
);
