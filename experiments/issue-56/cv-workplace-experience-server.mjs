import { cvWorkplaceExperienceFixture } from './cv-workplace-experience-fixture.mjs';
import {
  startCvFixtureServer,
  waitForCvFixtureShutdown,
} from './cv-fixture-server.mjs';

const f = await cvWorkplaceExperienceFixture();
try {
  const server = await startCvFixtureServer({
    store: f.store,
    localUi: true,
    vacancies: { artifactRoot: f.artifactRoot, cvPrepare: f.cvPrepare },
  });
  await waitForCvFixtureShutdown({
    base: `http://127.0.0.1:${server.port}`,
    close: server.close,
  });
} finally {
  await f.close();
}
