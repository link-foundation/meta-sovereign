import { startCvFixtureServer } from './cv-fixture-server.mjs';
import { technologyFixture } from './technology-fixture.mjs';
import { formalReportFixture } from './formal-report-fixture.mjs';

export const formalReportBrowserFixture = async () => {
  const native = await technologyFixture();
  const fixture = await formalReportFixture({
    store: native.store,
    beforeSearch: async (_term, signal) => {
      const held = await native.store.get(
        'secret:cv-formal-report:hold-report'
      );
      if (held?.phase === 'preparing') {
        signal.throwIfAborted();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
        signal.throwIfAborted();
      }
    },
  });
  try {
    const server = await startCvFixtureServer({
      localUi: true,
      store: native.store,
      vacancies: { artifactRoot: native.artifactRoot },
      cv: { formalReports: { github: fixture.github } },
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
      planRequestId: fixture.preview.planRequestId,
      writes: () =>
        fixture.calls.filter((call) => call.operation === 'write').length,
      close: async () => {
        await server.close();
        await fixture.close();
        await native.close();
      },
    };
  } catch (error) {
    await fixture.close();
    await native.close();
    throw error;
  }
};
