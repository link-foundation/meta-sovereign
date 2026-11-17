import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionBrowserControls } from './helpers/e2e-question-browser-controls.mjs';
import { verifySummaryChoices } from './helpers/e2e-summary-choice.mjs';
import { verifyQuestionBrowserWatch } from './helpers/e2e-question-browser-watch.mjs';
import { verifyQuestionPeriodWorkers } from './helpers/e2e-question-period-workers.mjs';
import { verifySalaryClarification } from './helpers/e2e-salary-clarification.mjs';
import { verifySalaryWording } from './helpers/e2e-salary-wording.mjs';
import { verifySalaryVocabulary } from './helpers/e2e-salary-vocabulary.mjs';

await runBrowserScenarios(
  'question-controls',
  process.env.SALARY_VOCABULARY_ONLY === '1'
    ? [verifySalaryVocabulary]
    : process.env.SALARY_WORDING_ONLY === '1'
      ? [verifySalaryWording]
      : process.env.SALARY_CLARIFICATION_ONLY === '1'
        ? [verifySalaryClarification]
        : process.env.QUESTION_PERIOD_WORKERS_ONLY === '1'
          ? [verifyQuestionPeriodWorkers]
          : [
              verifyQuestionBrowserControls,
              verifySummaryChoices,
              verifyQuestionBrowserWatch,
              verifyQuestionPeriodWorkers,
              verifySalaryClarification,
              verifySalaryWording,
              verifySalaryVocabulary,
            ]
);
