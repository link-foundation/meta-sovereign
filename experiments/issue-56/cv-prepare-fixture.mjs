import { randomUUID } from 'node:crypto';
import { cvTechnologyFixture } from './cv-technology-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const cvPrepareFixture = async () => {
  const data = await cvTechnologyFixture();
  const calls = { attached: 0, detached: 0, prepared: 0 };
  let prepare = async ({ phase, check }) => {
    await phase('opening');
    check();
    await phase('preparing');
    calls.prepared++;
  };
  const cvPrepare = {
    attach: async () => {
      calls.attached++;
      return {
        detach: async () => {
          calls.detached++;
        },
      };
    },
    prepare: (input) => prepare(input),
  };
  const service = createVacancyService({ ...data, cvPrepare });
  const catalog = await service['technology-catalog']();
  const draft = await service['technology-review']({
    ...data.input,
    revision: catalog.revision,
  });
  const { review } = await service['technology-review-save']({
    browserSlot: 'jobs',
    fingerprint: draft.review.fingerprint,
    selected: ['en:about', 'ru:about'],
  });
  const input = {
    browserSlot: 'jobs',
    requestId: randomUUID(),
    fingerprint: review.fingerprint,
    changeId: 'en:about',
  };
  return {
    ...data,
    service,
    cvPrepare,
    routeOptions: {
      store: data.store,
      service: { artifactRoot: data.artifactRoot, cvPrepare },
    },
    calls,
    review,
    prepare: (fn) => {
      prepare = fn;
    },
    input,
    rows: [
      ...data.rows,
      await data.store.get('jobs-cv-technology-review:jobs'),
    ],
    close: async () => {
      await service.stop();
      await data.close();
    },
  };
};
