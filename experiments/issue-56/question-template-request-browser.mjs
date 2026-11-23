import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  verifyTemplateBoundaryGuards,
  verifyTemplatePrefixGuards,
  verifyTemplateRequestGuards,
} from '../../js/tests/helpers/e2e-question-templates.mjs';

const variants = [
  ['boundary', verifyTemplateBoundaryGuards],
  ['prefix', verifyTemplatePrefixGuards],
  ['request', verifyTemplateRequestGuards],
];
const [kind, verify] =
  variants.find(([name]) => process.argv.includes(`--${name}`)) ?? variants[2];

await runBrowserScenarios(`question-template-${kind}`, [
  (browser) =>
    verify(browser, {
      before: process.argv.includes('--before'),
      screenshots: process.env.QUESTION_SCREENSHOT_DIR,
    }),
]);
