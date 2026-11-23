import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  verifyTemplateBoundaryGuards,
  verifyTemplateRequestGuards,
} from '../../js/tests/helpers/e2e-question-templates.mjs';

const boundary = process.argv.includes('--boundary');
const verify = boundary
  ? verifyTemplateBoundaryGuards
  : verifyTemplateRequestGuards;

await runBrowserScenarios(
  boundary ? 'question-template-boundary' : 'question-template-request',
  [
    (browser) =>
      verify(browser, {
        before: process.argv.includes('--before'),
        screenshots: process.env.QUESTION_SCREENSHOT_DIR,
      }),
  ]
);
