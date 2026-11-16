import { startServer } from '../../js/src/server/index.js';
import { technologyFixture } from './technology-fixture.mjs';
import { experiencePlanFixture } from './experience-plan-fixture.mjs';

export const experiencePlanBrowserFixture = async () => {
  const native = await technologyFixture();
  const fixture = await experiencePlanFixture({ store: native.store });
  let runs = 0;
  const original = fixture.adapters;
  const adapters = {
    resolve: (...args) => {
      if (args[0] === 'haiku') {
        runs++;
      }
      return original.resolve(...args);
    },
    translate: async (...args) => {
      const signal = args[3];
      if (runs > 1) {
        signal.throwIfAborted();
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve, { once: true })
        );
        signal.throwIfAborted();
      }
      return original.translate(...args);
    },
  };
  try {
    const server = await startServer({
      localUi: true,
      tls: false,
      port: 0,
      store: fixture.store,
      vacancies: { artifactRoot: native.artifactRoot },
      cv: { experiencePlanning: { adapters } },
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
      input: fixture.input(),
      close: async () => {
        await server.close();
        await native.close();
      },
    };
  } catch (error) {
    await native.close();
    throw error;
  }
};
