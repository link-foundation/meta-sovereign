import { randomUUID } from 'node:crypto';
import { cvTechnologyFixture } from './cv-technology-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const cvPrepareFixture = async ({
  selected = ['en:about', 'ru:about'],
  emptyWorkplaces,
} = {}) => {
  const data = await cvTechnologyFixture({ emptyWorkplaces });
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
  const rows = [...data.rows];
  let review;
  let input;
  if (!emptyWorkplaces) {
    const catalog = await service['technology-catalog']();
    const draft = await service['technology-review']({
      ...data.input,
      revision: catalog.revision,
    });
    ({ review } = await service['technology-review-save']({
      browserSlot: 'jobs',
      fingerprint: draft.review.fingerprint,
      selected,
    }));
    input = {
      browserSlot: 'jobs',
      requestId: randomUUID(),
      fingerprint: review.fingerprint,
      changeId: 'en:about',
    };
    rows.push(await data.store.get('jobs-cv-technology-review:jobs'));
  }
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
    rows,
    close: async () => {
      await service.stop();
      await data.close();
    },
  };
};
