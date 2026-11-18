import {
  applicationRunFixture,
  applicationIdentity,
} from './application-run-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';

/** Finite injected clock/random values; no real pacing sleeps or provider login. */
export const applicationPacingFixture = (t, options = {}) => {
  const clock = { value: Date.parse('2026-11-14T16:00:00.000Z') };
  const fixture = applicationRunFixture({
    application: {
      now: () => clock.value,
      pacingRandom: () => 0,
      ...options,
    },
  });
  fixture.store.flush ??= async () => {};
  const worker = () => createVacancyService(fixture.serviceOptions);
  Object.assign(fixture, {
    clock,
    worker,
    async open(number = 123, extra = {}, service = fixture.service) {
      return service['application-open']({
        url: `https://hh.ru/vacancy/${number}`,
        requestId: `pace-${number}`,
        autoSelectResumeLanguage: false,
        applicationIntervalSeconds: 0,
        ...extra,
      });
    },
    async release(receipt) {
      return fixture.service['application-close'](applicationIdentity(receipt));
    },
    queue: () => fixture.service['application-queue']({}),
  });
  t.after(() => fixture.close());
  return fixture;
};
