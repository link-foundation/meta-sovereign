import { verifySalaryDraft } from './salary-draft-browser.mjs';
import {
  vocabularySalary as salary,
  salaryVocabularyQuestion as question,
  salaryVocabularyRules,
  salaryVocabularyExpected as expected,
} from '../../../experiments/issue-56/salary-vocabulary-fixture.mjs';

export const verifySalaryVocabulary = async (browser) => {
  console.log(
    '[salary-vocabulary]',
    JSON.stringify(
      await verifySalaryDraft(browser, {
        question,
        expected,
        input: { salary },
        rules: salaryVocabularyRules(),
        screenshot: process.env.SALARY_VOCABULARY_SCREENSHOT,
      })
    )
  );
};
