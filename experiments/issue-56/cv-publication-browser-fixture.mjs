import { cvPublicationFixture } from './cv-publication-fixture.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';

export const cvPublicationBrowserFixture = async (browser) => {
  let loseReceipt = false;
  const publication = await cvPublicationFixture({
    intercept: async ({ args, proceed }) => {
      const answer = await proceed();
      if (loseReceipt && args.includes('push')) {
        throw new Error('Fixture lost push receipt');
      }
      return answer;
    },
  });
  try {
    const app = await vacancyBrowserFixture(browser, {
      store: publication.store,
      exports: {
        service: () => ({ cvPublication: publication.options.cvPublication }),
      },
    });
    return {
      ...app,
      publication,
      loseReceipt: () => {
        loseReceipt = true;
      },
      async close() {
        try {
          await app.close();
        } finally {
          await publication.close();
        }
      },
    };
  } catch (error) {
    await publication.close();
    throw error;
  }
};
