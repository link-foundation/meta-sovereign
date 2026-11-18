import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyDeferredQuestions } from './helpers/e2e-deferred-questions.mjs';

await runBrowserScenarios('deferred-questions', [verifyDeferredQuestions]);
