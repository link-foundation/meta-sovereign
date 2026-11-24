import {
  applicationFixture,
  applicationInput,
} from './application-fixture.mjs';
import { vacancySkipResult } from '../../js/src/jobs/vacancy-skip-data.js';

export const skipSnapshot = (more = {}) =>
  vacancySkipResult({
    version: 1,
    browserSlot: 'jobs',
    revision: globalThis.crypto.randomUUID(),
    entries: [
      {
        url: applicationInput.url,
        title: 'Python engineer',
        reason: 'external_site',
        externalUrl: 'https://employer.example/apply',
        time: '2026-11-18T04:00:00Z',
        attempts: 1,
        requestId: applicationInput.requestId,
      },
    ],
    ...more,
  });

/** Observe the actual application service, rather than synthesizing its writes. */
export const observedSkip = async (
  t,
  reason = 'external_site',
  options = {}
) => {
  const f = applicationFixture(options);
  t.after(() => f.close());
  let receipt = await f.enter();
  f.state.page[
    {
      external_site: 'external',
      resume_not_visible: 'resumeNotVisible',
      vacancy_unavailable: 'vacancyUnavailable',
    }[reason]
  ] = true;
  if (reason === 'external_site') {
    f.state.page.externalUrl = 'https://employer.example/apply';
  }
  receipt = await f.service['application-read']({
    ...applicationInput,
    revision: receipt.revision,
  });
  const snapshot = await f.service['skips-stored']({});
  return {
    ...f,
    receipt,
    snapshot,
    identity: { ...applicationInput, revision: receipt.revision },
  };
};
