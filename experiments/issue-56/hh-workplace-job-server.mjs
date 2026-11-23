import { setTimeout as delay } from 'node:timers/promises';
import { cvWorkplaceExperienceFixture } from './cv-workplace-experience-fixture.mjs';
import {
  startCvFixtureServer,
  waitForCvFixtureShutdown,
} from './cv-fixture-server.mjs';

const fixture = await cvWorkplaceExperienceFixture();
try {
  const server = await startCvFixtureServer({
    store: fixture.store,
    localUi: true,
    vacancies: {
      artifactRoot: fixture.artifactRoot,
      cvPrepare: fixture.cvPrepare,
    },
    cv: {
      experience: {
        hhWorkplace: {
          async prepareJob(_change, signal, update, decision) {
            await update({ phase: 'prepared' });
            while (!decision()) {
              await delay(50, undefined, { signal });
            }
            if (decision() === 'skip') {
              return { phase: 'skipped' };
            }
            await update({ phase: 'saving', initiator: 'cli-or-api' });
            return { phase: 'unconfirmed' };
          },
        },
      },
    },
  });
  console.log(JSON.stringify({ comparison: fixture.row.requestId }));
  await waitForCvFixtureShutdown({
    base: `http://127.0.0.1:${server.port}`,
    close: server.close,
  });
} finally {
  await fixture.close();
}
