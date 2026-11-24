import { questionMetaLinksServer } from '../../../experiments/issue-56/question-meta-links-server.mjs';
import {
  metaQuestionAutomation,
  metaTarget,
} from '../../../experiments/issue-56/question-meta-links-fixture.mjs';
import { verifyStoredQuestionLinks } from './e2e-stored-question-links.mjs';

export const verifyMetaQuestionLinks = (browser, options = {}) =>
  verifyStoredQuestionLinks(browser, {
    ...options,
    fixtureFactory: questionMetaLinksServer,
    automation: metaQuestionAutomation.id,
    target: metaTarget,
  });
