import {
  questionApiLinksServer,
  serveQuestionLinkFixture,
} from './question-api-links-server.mjs';
import { seedMetaQuestionLinks } from './question-meta-links-fixture.mjs';

export const questionMetaLinksServer = () =>
  questionApiLinksServer(seedMetaQuestionLinks);

if (process.argv.includes('--meta')) {
  serveQuestionLinkFixture(await questionMetaLinksServer());
}
