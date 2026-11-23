import { verifyCvLinkedinExperience } from './helpers/e2e-cv-linkedin-experience.mjs';
import { verifyCvExperiencePlans } from './helpers/e2e-cv-experience-plan.mjs';
import { verifyCvExperienceAuto } from './helpers/e2e-cv-experience-auto.mjs';
import { verifyCvExperienceReview } from './helpers/e2e-cv-experience-review.mjs';
import { verifyHhAboutJob } from './helpers/e2e-cv-hh-about-job.mjs';
import { verifyCvFormalReports } from './helpers/e2e-cv-formal-report.mjs';
import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyCvTranslation } from './helpers/e2e-cv-translation.mjs';
import { verifyCvExperience } from './helpers/e2e-cv-experience.mjs';
import { verifyHhAcquisition } from './helpers/e2e-cv-hh-acquisition.mjs';

import { verifyCvExperienceDocuments } from './helpers/e2e-cv-experience-documents.mjs';

await runBrowserScenarios('cv-translation', [
  verifyCvTranslation,
  verifyCvExperience,
  verifyCvExperienceDocuments,
  verifyHhAcquisition,
  verifyCvLinkedinExperience,
  verifyCvExperiencePlans,
  verifyCvExperienceAuto,
  verifyCvExperienceReview,
  verifyHhAboutJob,
  verifyCvFormalReports,
]);
