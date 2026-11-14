import { applicationNativeFixture } from './application-native-fixture.mjs';
import { resumeLanguageFixture } from './resume-language-fixture.mjs';
import { resumeListFixture } from './resume-list-fixture.mjs';

export const applicationResumeNativeFixture = async (browser) => {
  const evidence = await resumeLanguageFixture();
  try {
    await evidence.store.put({
      id: 'jobs-resumes:jobs',
      version: 1,
      ...resumeListFixture(),
    });
    const fixture = await applicationNativeFixture(browser, {
      store: evidence.store,
      artifactRoot: evidence.artifactRoot,
      resumeChooser: true,
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
