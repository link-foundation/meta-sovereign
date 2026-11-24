import { randomUUID } from 'node:crypto';
import { experienceFromHhExport } from '../../js/src/cv/experience-hh.js';
import { createExperiencePlanningService } from '../../js/src/cv/experience-plan-service.js';
import { saveExperienceDocument } from '../../js/src/cv/experience-store.js';
import { cvWorkplaceFieldsFixture } from './cv-workplace-fields-fixture.mjs';
import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { settledExperiencePlan } from './experience-plan-fixture.mjs';

export const seedWorkplaceExperience = async (fixture) => {
  const source = fixture.sources.find((row) => row.identity.language === 'en');
  const hh = await experienceFromHhExport(fixture, source.identity);
  const original = hh.document.jobs[0];
  const linkedin = experienceDocumentFixture('linkedin');
  linkedin.profile = { about: hh.document.profile.about };
  return {
    original,
    hh,
    linkedin,
    matched: {
      company: original.company,
      title: original.title,
      description: 'Reviewed changes from the source CV.',
      location: 'Moscow',
      start: original.start,
      current: false,
      end: '2024-08',
      skills: [...original.skills, 'New skill'],
      media: [{ title: 'Work sample', url: 'https://example.test/sample' }],
    },
    added: {
      company: 'Independent workplace',
      title: 'Engineer',
      description: 'An independent workplace.',
      start: '2018-10',
      end: '2019-01',
      current: false,
    },
  };
};

export const completeWorkplaceExperience = async (store, hh, linkedin, to) => {
  const requestId = randomUUID();
  const saved = await saveExperienceDocument(store, linkedin);
  const planner = createExperiencePlanningService({ store });
  await planner.start({
    requestId,
    to: to ?? 'hh',
    hh: hh.revision,
    linkedin: saved.revision,
  });
  return settledExperiencePlan(planner, requestId);
};

export const cvWorkplaceExperienceFixture = async () => {
  const fixture = await cvWorkplaceFieldsFixture();
  const experience = await seedWorkplaceExperience(fixture);
  const { matched, added, hh, linkedin } = experience;
  linkedin.jobs = [matched, added];
  const row = await completeWorkplaceExperience(fixture.store, hh, linkedin);
  return { ...fixture, ...experience, row };
};

export const workplaceExperienceInput = (row, kind) => ({
  experience: {
    requestId: row.requestId,
    fingerprint: row.fingerprint,
    jobIndex: row.plan.jobs.findIndex((job) => job.kind === kind),
  },
  ...(kind === 'update' ? { recordId: '123' } : {}),
});
