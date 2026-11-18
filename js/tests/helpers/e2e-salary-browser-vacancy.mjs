import assert from 'node:assert/strict';
import { verifySalaryDraft } from './salary-draft-browser.mjs';
import { clarificationSalary as salary } from '../../../experiments/issue-56/salary-clarification-fixture.mjs';
import {
  salaryVacancyQuestion as question,
  salaryVacancyAnswer as expected,
  salaryVacancyUrl,
} from '../../../experiments/issue-56/salary-vacancy-fixture.mjs';
import {
  salaryVacancyBrowserReader,
  mountSalaryVacancy,
} from '../../../experiments/issue-56/salary-vacancy-browser-fixture.mjs';

export const verifySalaryBrowserVacancy = async (browser, scenario = {}) => {
  const reader = salaryVacancyBrowserReader(browser);
  const baseline = process.env.SALARY_VACANCY_EXPECT_DEFAULT === '1';
  const receipt = await verifySalaryDraft(browser, {
    question,
    expected: baseline ? 'From 450 000 ₽ net per month.' : expected,
    input: { salary },
    fixtureOptions: { readVacancy: reader.readVacancy },
    prepare: mountSalaryVacancy,
    screenshot: process.env.SALARY_VACANCY_SCREENSHOT,
    ...scenario,
  });
  assert.equal(reader.records.length, scenario.reads ?? (baseline ? 0 : 1));
  for (const record of reader.records) {
    assert.equal(record.closed, true);
    assert.deepEqual(record.navigation, [salaryVacancyUrl]);
    assert.equal(record.slot, 'question-vacancy');
    assert.equal(record.useCase, 'messages');
  }
  console.log(
    scenario.marker ?? '[salary-browser-vacancy]',
    JSON.stringify({
      ...receipt,
      reads: reader.records.length,
      resourcesClosed: true,
      liveProvider: false,
    })
  );
};
