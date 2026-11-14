import { resumeLanguageFixture } from './resume-language-fixture.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

export const resumeLanguageBrowserFixture = async (browser) => {
  const evidence = await resumeLanguageFixture();
  try {
    const fixture = await vacancyBrowserFixture(browser, {
      store: evidence.store,
      exports: {
        service: () => ({ artifactRoot: evidence.artifactRoot }),
        route: async () => false,
      },
    });
    return {
      ...fixture,
      evidence,
      close: async () => {
        try {
          await fixture.close();
        } finally {
          await evidence.close();
        }
      },
    };
  } catch (error) {
    await evidence.close();
    throw error;
  }
};
