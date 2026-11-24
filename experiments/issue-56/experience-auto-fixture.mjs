import { technologyFixture } from './technology-fixture.mjs';
import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { experiencePlanFixture } from './experience-plan-fixture.mjs';

export const experienceAutoFixture = async ({ beforeRead } = {}) => {
  const hh = await technologyFixture();
  try {
    const plan = await experiencePlanFixture({ store: hh.store });
    const linkedin = experienceDocumentFixture('linkedin');
    linkedin.source.language = 'ru';
    linkedin.jobs[0].description = 'Руководство командой.';
    const calls = [];
    const read = async ({ requestId, signal }, progress) => {
      calls.push(requestId);
      await progress('waiting-login');
      await beforeRead?.(signal);
      signal.throwIfAborted();
      await progress('reading', { positions: linkedin.jobs.length });
      return {
        document: linkedin,
        files: [
          'linkedin-experience.txt',
          'linkedin-experience.json',
          'experience.lino',
          'experience.bin',
        ].map((name) => ({ name, size: 0, sha256: 'a'.repeat(64) })),
        discard: async () => {},
      };
    };
    return {
      ...hh,
      linkedin,
      calls,
      translationCalls: plan.calls,
      vacancies: { artifactRoot: hh.artifactRoot },
      cv: {
        experience: { read },
        experiencePlanning: { adapters: plan.adapters },
      },
      input: {
        hash: hh.input.hash,
        url: linkedin.source.url,
        language: linkedin.source.language,
        asOf: '2026-11',
        to: 'linkedin',
      },
    };
  } catch (error) {
    await hh.close();
    throw error;
  }
};
