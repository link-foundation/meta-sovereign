import { startServer } from '../../js/src/server/index.js';
import { technologyFixture } from './technology-fixture.mjs';

export const experienceDocumentBrowserFixture = async () => {
  const native = await technologyFixture();
  try {
    const server = await startServer({
      localUi: true,
      tls: false,
      port: 0,
      store: native.store,
      vacancies: { artifactRoot: native.artifactRoot },
      enableHandlers: false,
      enableSync: false,
      telegramAccount: false,
      automations: { scheduler: false },
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
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
