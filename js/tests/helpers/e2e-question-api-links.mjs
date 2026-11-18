import { questionApiLinksServer } from '../../../experiments/issue-56/question-api-links-server.mjs';
import {
  apiLink,
  apiLinkAutomation,
} from '../../../experiments/issue-56/question-api-links-fixture.mjs';
import { verifyStoredQuestionLinks } from './e2e-stored-question-links.mjs';

export const verifyApiQuestionLinks = (browser, options = {}) =>
  verifyStoredQuestionLinks(browser, {
    ...options,
    fixtureFactory: questionApiLinksServer,
    automation: apiLinkAutomation.id,
    target: apiLink.first,
  });
