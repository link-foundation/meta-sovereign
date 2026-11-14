import { applicationNativeFixture } from './application-native-fixture.mjs';
import { resumeLanguageFixture } from './resume-language-fixture.mjs';
import { resumeListFixture } from './resume-list-fixture.mjs';
import { readApplicationPage } from '../../js/src/jobs/application-page.js';
import { applicationLanguageEvidence } from './application-language-fixture.mjs';

const diagnosticApplication =
  process.env.MS_JOBS_APPLICATION_DEBUG === '1'
    ? {
        readPage: async (...args) => {
          try {
            return await readApplicationPage(...args);
          } catch (error) {
            console.error('Synthetic native read:', error);
            throw error;
          }
        },
      }
    : undefined;

export const applicationResumeNativeFixture = async (
  browser,
  { language = false } = {}
) => {
  const evidence = await resumeLanguageFixture();
  try {
    await evidence.store.put({
      id: 'jobs-resumes:jobs',
      version: 1,
      ...resumeListFixture(),
    });
    if (language) {
      await applicationLanguageEvidence(evidence);
    }
    const fixture = await applicationNativeFixture(browser, {
      store: evidence.store,
      artifactRoot: evidence.artifactRoot,
      resumeChooser: true,
      ...(language
        ? { questionLabel: 'Расскажите о вашем последнем опыте работы' }
        : {}),
      application: diagnosticApplication,
    });
    const close = fixture.close.bind(fixture);
    fixture.close = async () => {
      try {
        await close();
      } finally {
        await evidence.close();
      }
    };
    return fixture;
  } catch (error) {
    await evidence.close();
    throw error;
  }
};
