import {
  verifyCvLinkedinAbout,
  verifyCvLinkedinAddAbout,
} from '../../js/tests/helpers/e2e-cv-linkedin-about.mjs';
import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';

await runBrowserScenarios(
  'linkedin-about',
  process.env.LINKEDIN_ADD_ABOUT_ONLY === '1'
    ? [verifyCvLinkedinAddAbout]
    : [verifyCvLinkedinAbout, verifyCvLinkedinAddAbout]
);
