import { experienceAutoFixture } from './experience-auto-fixture.mjs';
import { startCvFixtureServer } from './cv-fixture-server.mjs';

export const experienceAutoBrowserFixture = async () => {
  const fixture = await experienceAutoFixture();
  try {
    const server = await startCvFixtureServer({
      store: fixture.store,
      vacancies: fixture.vacancies,
      cv: fixture.cv,
      localUi: true,
    });
    return {
      base: `http://127.0.0.1:${server.port}`,
      input: fixture.input,
      close: async () => {
        await server.close();
        await fixture.close();
      },
    };
  } catch (error) {
    await fixture.close();
    throw error;
  }
};
