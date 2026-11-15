import { questionEmailLinksServer } from '../../../experiments/issue-56/question-email-links-server.mjs';
import {
  emailLinkAutomation,
  emailLinkTarget,
} from '../../../experiments/issue-56/question-email-links-fixture.mjs';
import { verifyStoredQuestionLinks } from './e2e-stored-question-links.mjs';

export const verifyEmailQuestionLinks = (browser, options = {}) =>
  verifyStoredQuestionLinks(browser, {
    ...options,
    fixtureFactory: questionEmailLinksServer,
    automation: emailLinkAutomation.id,
    target: emailLinkTarget('mime'),
  });
