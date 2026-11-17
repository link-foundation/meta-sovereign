import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifySalaryClarification } from './helpers/e2e-salary-clarification.mjs';
import { verifySalaryTemplateContext } from './helpers/e2e-salary-template-context.mjs';
import { verifySalaryContextPriority } from './helpers/e2e-salary-context-priority.mjs';

await runBrowserScenarios(
  'question-salary-context',
  process.env.SALARY_PRIORITY_ONLY === '1'
    ? [verifySalaryContextPriority]
    : process.env.SALARY_TEMPLATE_CONTEXT_ONLY === '1'
      ? [verifySalaryTemplateContext]
      : process.env.SALARY_CLARIFICATION_ONLY === '1'
        ? [verifySalaryClarification]
        : [
            verifySalaryClarification,
            verifySalaryTemplateContext,
            verifySalaryContextPriority,
          ]
);
