import { salaryBrowserContext } from './salary-browser-context-fixture.mjs';
import { mountSalaryHistory } from './salary-browser-history.mjs';

export const employerSalaryAnchor =
  'What salary expectations in EUR gross do you have?';
export const ownerSalaryReply = 'From $6 000 net per month.';
export const employerSalaryQuestion = 'And net?';
export const employerSalaryAnswer = 'From 5 500 € net per month.';
export const employerSalarySnapshot = () => {
  const observed = salaryBrowserContext();
  observed.messages[0].body = employerSalaryAnchor;
  observed.messages[1].body = ownerSalaryReply;
  observed.question.body = employerSalaryQuestion;
  observed.messages.at(-1).body = employerSalaryQuestion;
  return observed;
};
export const employerSalaryMessages = () =>
  employerSalarySnapshot().messages.map((row) => ({
    ...row,
    source: 'hh',
    chat: '7',
  }));
export const mountEmployerSalary = async (fixture) => {
  await mountSalaryHistory(fixture, [employerSalaryAnchor]);
  await fixture.page
    .locator('#history article')
    .nth(1)
    .locator('p')
    .evaluate((body, text) => {
      body.textContent = text;
    }, ownerSalaryReply);
};
