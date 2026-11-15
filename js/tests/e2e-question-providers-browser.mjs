import { runBrowserScenarios } from './helpers/e2e-browser-scenarios.mjs';
import { verifyProviderChoices } from './helpers/e2e-provider-choices.mjs';
import { verifyHhChoices } from './helpers/e2e-hh-choices.mjs';
import { verifyChoiceVisibility } from './helpers/e2e-choice-visibility.mjs';
import { verifyEmailQuestionLinks } from './helpers/e2e-question-email-links.mjs';

await runBrowserScenarios('question-providers', [
  verifyProviderChoices,
  verifyHhChoices,
  verifyChoiceVisibility,
  verifyEmailQuestionLinks,
]);
