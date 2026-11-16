import { cvPublicationFixture } from './cv-publication-fixture.mjs';
import { vacancyBrowserFixture } from './vacancy-browser-fixture.mjs';
import { seedPublicationExport } from './cv-publication-export-fixture.mjs';
import { seedExperiencePublication } from './experience-publication-fixture.mjs';

export const cvPublicationBrowserFixture = async (
  browser,
  { nativeExport = false, experienceDocuments = false } = {}
) => {
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
    const exported = nativeExport
      ? await seedPublicationExport(publication)
      : null;
    const experiences = experienceDocuments
      ? await Promise.all(
          ['hh', 'linkedin'].map((platform) =>
            seedExperiencePublication(publication, platform)
          )
        )
      : [];
    const app = await vacancyBrowserFixture(browser, {
      store: publication.store,
      exports: {
        service: () => ({
          artifactRoot: publication.artifactRoot,
          cvPublication: publication.options.cvPublication,
        }),
      },
    });
    return {
      ...app,
      publication,
      exported,
      experiences,
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
