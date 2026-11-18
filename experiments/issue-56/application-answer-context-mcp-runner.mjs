import { applicationPanelBrowser } from '../../js/tests/helpers/application-panel-browser.mjs';
import { configureApplicationAnswerContext } from './application-answer-context-ui.mjs';
import { applicationAnswerSalary } from './application-answer-context-fixture.mjs';
import { translate } from '../../js/src/web/i18n.js';

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
export const applicationAnswerMcpRunner = (work) =>
  `async (page) => {
  const assert = { equal(a, b) { if (a !== b) throw new Error('Browser assertion failed'); } };
  const translate = (_locale, key) => (${JSON.stringify(labels)})[key];
  const applicationAnswerSalary = ${JSON.stringify(applicationAnswerSalary)};
  const applicationPanelBrowser = ${applicationPanelBrowser.toString()};
  const configureApplicationAnswerContext = ${configureApplicationAnswerContext.toString()};
  // Work is trusted repository function source, including any final semicolon.
  // Keep fixture string values intact instead of rewriting generated code.
  const inspect = ${work}
  ; return inspect(page, applicationPanelBrowser, configureApplicationAnswerContext);
}`;
