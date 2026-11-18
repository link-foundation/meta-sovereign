import { vkGreetingCatalogServer } from './vk-greeting-catalog-fixture.mjs';
import { serveQuestionLinkFixture } from './question-api-links-server.mjs';
serveQuestionLinkFixture(await vkGreetingCatalogServer());
