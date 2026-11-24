import { questionVkLinksServer } from '../../../experiments/issue-56/question-vk-links-server.mjs';
import {
  vkQuestionLink,
  vkQuestionAutomation,
} from '../../../experiments/issue-56/question-vk-links-fixture.mjs';
import { verifyStoredQuestionLinks } from './e2e-stored-question-links.mjs';

export const verifyVkQuestionLinks = (browser, options = {}) =>
  verifyStoredQuestionLinks(browser, {
    ...options,
    fixtureFactory: questionVkLinksServer,
    automation: vkQuestionAutomation.id,
    target: vkQuestionLink.first,
  });
