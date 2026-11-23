import { questionApiLinksServer } from '../../../experiments/issue-56/question-api-links-server.mjs';
import {
  seedWhatsappQuestionLinks,
  whatsappQuestionAutomation,
  whatsappTarget,
} from '../../../experiments/issue-56/question-whatsapp-links-fixture.mjs';
import { verifyStoredQuestionLinks } from './e2e-stored-question-links.mjs';

export const questionWhatsappLinksServer = () =>
  questionApiLinksServer(seedWhatsappQuestionLinks);

export const verifyWhatsappQuestionLinks = (browser, options = {}) =>
  verifyStoredQuestionLinks(browser, {
    ...options,
    fixtureFactory: questionWhatsappLinksServer,
    automation: whatsappQuestionAutomation.id,
    target: whatsappTarget,
  });
