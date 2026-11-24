import { runBrowserScenarios } from '../../js/tests/helpers/e2e-browser-scenarios.mjs';
import {
  questionWhatsappLinksServer,
  verifyWhatsappQuestionLinks,
} from '../../js/tests/helpers/e2e-question-whatsapp-links.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';

if (process.argv.includes('--whatsapp')) {
  serveQuestionLinkFixture(await questionWhatsappLinksServer());
} else {
  await runBrowserScenarios('question-whatsapp-links', [
    (browser) =>
      verifyWhatsappQuestionLinks(browser, {
        screenshots: process.env.QUESTION_SCREENSHOT_DIR,
        before: process.argv.includes('--before'),
      }),
  ]);
}
