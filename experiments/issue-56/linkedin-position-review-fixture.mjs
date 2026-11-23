import { randomUUID } from 'node:crypto';
import { createLinkedinExperienceService } from '../../js/src/cv/linkedin-experience-service.js';
import { createExperiencePlanningService } from '../../js/src/cv/experience-plan-service.js';
import {
  saveExperienceDocument,
  storedExperienceDocument,
} from '../../js/src/cv/experience-store.js';
import { experienceDocumentFixture } from './experience-document-fixture.mjs';
import { settledExperiencePlan } from './experience-plan-fixture.mjs';
import { settledLinkedinFixture } from './linkedin-export-settled.mjs';
import {
  linkedinExportInput,
  linkedinReaderFixture,
} from './linkedin-experience-fixture.mjs';

export const linkedinPositionReviewFixture = async (options) => {
  const context = await linkedinReaderFixture(options);
  const { store } = context;
  try {
    const exporter = createLinkedinExperienceService(context);
    const input = linkedinExportInput();
    await exporter.start(input);
    const result = await settledLinkedinFixture(() => exporter.status(input));
    const linkedin = await storedExperienceDocument(store, result.revision);
    const hh = experienceDocumentFixture('hh');
    hh.source.language = 'en';
    hh.profile = {};
    hh.jobs = [
      {
        company: 'Fixture Company',
        title: 'Lead engineer',
        start: '2023-01',
        current: true,
        end: null,
        description: 'Reviewed description.',
        skills: ['rust', 'PostgreSQL'],
        native: { website: 'https://example.test/portfolio?mode=work' },
      },
      {
        company: 'Standalone company',
        title: 'Developer',
        start: '2016-04',
        end: '2018-01',
        current: false,
        native: { website: 'https://example.test/standalone' },
      },
    ];
    const planner = createExperiencePlanningService({ store });
    const complete = async ({
      source = hh,
      target = linkedin,
      to = 'linkedin',
    } = {}) => {
      const requestId = randomUUID();
      const saved = await saveExperienceDocument(store, source);
      await planner.start({
        requestId,
        to,
        hh: saved.revision,
        linkedin: target.revision,
      });
      return settledExperiencePlan(planner, requestId);
    };
    return { ...context, complete, hh, linkedin, row: await complete() };
  } catch (error) {
    await context.close();
    throw error;
  }
};

export const linkedinPositionReference = (row, kind) => ({
  requestId: row.requestId,
  fingerprint: row.fingerprint,
  jobIndex: row.plan.jobs.findIndex((item) => item.kind === kind),
});
