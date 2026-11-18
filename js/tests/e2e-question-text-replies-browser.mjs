import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyTextReplyControls } from './helpers/e2e-text-reply.mjs';

await runBrowserScenarios('question-text-replies', [verifyTextReplyControls]);
