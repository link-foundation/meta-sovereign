import {
  startCvFixtureServer,
  waitForCvFixtureShutdown,
} from './cv-fixture-server.mjs';
import { technologyFixture } from './technology-fixture.mjs';

const fixture = await technologyFixture();
const server = await startCvFixtureServer({
  localUi: true,
  store: fixture.store,
  vacancies: {
    artifactRoot: fixture.artifactRoot,
    readResumeExports: () => {
      throw new Error('The independent cache fixture has no browser export.');
    },
  },
});
await waitForCvFixtureShutdown({
  base: `http://127.0.0.1:${server.port}`,
  close: async () => {
    await server.close();
    await fixture.close();
  },
});
