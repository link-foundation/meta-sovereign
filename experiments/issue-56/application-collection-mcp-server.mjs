import { applicationNativeFixture } from './application-native-fixture.mjs';
import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { modelFingerprint } from '../../js/src/automation/answer-model-context.js';

let fixture;
await serveNativeMcpFixture(
  async (browser) => (fixture = await applicationNativeFixture(browser)),
  async () => {
    const rows = await fixture.store.query();
    const cache = rows.filter((row) =>
      row.id.startsWith('assignment-vacancy:')
    );
    const journal = rows.find((row) =>
      row.id.startsWith('secret:jobs-application:')
    );
    return {
      cacheEntries: cache.length,
      cacheFingerprint: await modelFingerprint(JSON.stringify(cache)),
      journalVacancy: journal ? Boolean(journal.vacancy) : null,
      collection: journal?.options.collectVacancies ?? null,
    };
  }
);
