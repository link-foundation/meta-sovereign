import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import {
  verifyQuestionTemplates,
  verifyTemplateBoundaryGuards,
  verifyTemplateLinkGuards,
  verifyTemplatePrefixGuards,
  verifyTemplateRequestGuards,
} from './helpers/e2e-question-templates.mjs';
import { verifyHiddenQuestionLinks } from './helpers/e2e-question-hidden-links.mjs';
import { verifyApiQuestionLinks } from './helpers/e2e-question-api-links.mjs';
import { verifyMetaQuestionLinks } from './helpers/e2e-question-meta-links.mjs';
import { verifyVkQuestionLinks } from './helpers/e2e-question-vk-links.mjs';

await runBrowserScenarios('question-templates', [
  verifyQuestionTemplates,
  verifyTemplateLinkGuards,
  verifyTemplateRequestGuards,
  verifyHiddenQuestionLinks,
  verifyApiQuestionLinks,
  verifyVkQuestionLinks,
  verifyMetaQuestionLinks,
  verifyTemplateBoundaryGuards,
  verifyTemplatePrefixGuards,
]);
