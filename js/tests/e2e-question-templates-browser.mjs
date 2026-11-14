import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyQuestionTemplates } from './helpers/e2e-question-templates.mjs';

await runBrowserScenarios('question-templates', [verifyQuestionTemplates]);
