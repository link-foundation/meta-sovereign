import {
  questionApiLinksServer,
  serveQuestionLinkFixture,
} from './question-api-links-server.mjs';
import { seedVkQuestionLinks } from './question-vk-links-fixture.mjs';

export const questionVkLinksServer = () =>
  questionApiLinksServer(seedVkQuestionLinks);
if (process.argv.includes('--vk')) {
  serveQuestionLinkFixture(await questionVkLinksServer());
}
