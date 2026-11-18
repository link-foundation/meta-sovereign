import { createMemoryStore } from '../../js/src/storage/universal.js';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { seedVacancyCorpus } from './vacancy-corpus-fixture.mjs';

const store = createMemoryStore();
await seedVacancyCorpus(store);
await serveNativeMcpFixture(
  (browser) => vacancyBrowserFixture(browser, { store }),
  () => ({ seeded: 101 })
);
