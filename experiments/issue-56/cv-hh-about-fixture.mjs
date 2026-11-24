import { experienceFromHhExport } from '../../js/src/cv/experience-hh.js';
import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { completeWorkplaceExperience } from './cv-workplace-experience-fixture.mjs';

export const seedHhAboutExperience = async (fixture) => {
  const { identity } = fixture.sources.find(({ cv }) => cv.language === 'en');
  const hh = await experienceFromHhExport(fixture, identity);
  const linkedin = experienceDocumentFixture('linkedin');
  linkedin.jobs = hh.document.jobs;
  linkedin.profile = {
    about: 'I build reliable services and maintain their infrastructure.',
  };
  const comparison = await completeWorkplaceExperience(
    fixture.store,
    hh,
    linkedin
  );
  return {
    comparison,
    identity,
    before: hh.document.profile.about,
    after: linkedin.profile.about,
    input: {
      planRequestId: comparison.requestId,
      fingerprint: comparison.fingerprint,
    },
  };
};
