import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifySalaryWording } from './helpers/e2e-salary-wording.mjs';
import { verifySalaryVocabulary } from './helpers/e2e-salary-vocabulary.mjs';
import { verifySalaryIntent } from './helpers/e2e-salary-intent.mjs';

await runBrowserScenarios(
  'question-salary-wording',
  process.env.SALARY_INTENT_ONLY === '1'
    ? [verifySalaryIntent]
    : process.env.SALARY_VOCABULARY_ONLY === '1'
      ? [verifySalaryVocabulary]
      : process.env.SALARY_WORDING_ONLY === '1'
        ? [verifySalaryWording]
        : [verifySalaryWording, verifySalaryVocabulary, verifySalaryIntent]
);
