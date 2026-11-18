import { createMemoryStore } from '../../js/src/storage/index.js';
import { cvToLink } from '../../js/src/cv/index.js';
import { startServer } from '../../js/src/server/index.js';
import { experienceEntries } from './experience-fixture.mjs';

export const experienceBrowserFixture = async () => {
  const store = createMemoryStore();
  for (const entry of experienceEntries()) {
    await store.put(cvToLink(entry));
  }
  const server = await startServer({
    localUi: true,
    tls: false,
    port: 0,
    store,
    enableHandlers: false,
    enableSync: false,
    telegramAccount: false,
    automations: { scheduler: false },
  });
  return {
    base: `http://127.0.0.1:${server.port}`,
    close: () => server.close(),
  };
};
