import { startCvFixtureServer } from './cv-fixture-server.mjs';
import { technologyFixture } from './technology-fixture.mjs';

export const experienceDocumentBrowserFixture = async () => {
  const native = await technologyFixture();
  try {
    const server = await startCvFixtureServer({
      localUi: true,
      store: native.store,
      vacancies: { artifactRoot: native.artifactRoot },
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
