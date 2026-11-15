import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyQuestionTemplates,
  verifyTemplateLinkGuards,
} from './helpers/e2e-question-templates.mjs';
import { verifyHiddenQuestionLinks } from './helpers/e2e-question-hidden-links.mjs';

await runBrowserScenarios('question-templates', [
  verifyQuestionTemplates,
  verifyTemplateLinkGuards,
  verifyHiddenQuestionLinks,
]);
