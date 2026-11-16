import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { saveExperienceDocument } from '../../js/src/cv/experience-store.js';

/** Synthetic private data in the existing isolated publication repositories. */
export const seedExperiencePublication = async (fixture, platform = 'hh') => {
  const document = experienceDocumentFixture(platform);
  Object.assign(document.profile, {
    title: 'Software Engineer',
    email: 'private@example.test',
    birthDate: '1990-01-01',
    salary: '100000 USD',
    about:
      'Public engineering work\nEmail: private@example.test\nSalary: 100000 USD',
  });
  document.jobs[0].description += '\nContact: private@example.test';
  document.jobs[0].native.industries[0].parent = 'Information technology';
  const saved = await saveExperienceDocument(fixture.store, document);
  return {
    ...saved,
    input: {
      requestId: `experience-publication-${platform}`,
      repository: fixture.repository,
      experienceRevision: saved.revision,
    },
    entry: {
      revision: saved.revision,
      platform,
      provenance: saved.provenance.kind,
      source: saved.document.source,
      jobs: saved.document.jobs.length,
    },
  };
};
