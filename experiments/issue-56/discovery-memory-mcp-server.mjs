import { serveNativeMcpFixture } from './application-native-mcp-server.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { runVacancy } from '../../js/src/assignments/vacancy-run-context.js';

let fixture;
await serveNativeMcpFixture(
  async (browser) => (fixture = await vacancyBrowserFixture(browser)),
  async () => ({
    savedDescriptions: (
      await fixture.store.query((row) =>
        row.id.startsWith('assignment-vacancy:')
      )
    ).length,
    temporaryDescriptions: ['123', '125'].filter((id) =>
      runVacancy(fixture.runtimeStore, `https://hh.ru/vacancy/${id}`)
    ).length,
  })
);
