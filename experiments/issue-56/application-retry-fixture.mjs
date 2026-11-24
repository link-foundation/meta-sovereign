import {
  applicationDeferralFixture,
  identity,
} from './application-deferral-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';
import { searchFixture, vacancySnapshotFixture } from './vacancy-fixture.mjs';
import { validateVacancySearch } from '../../js/src/jobs/search-result.js';
import { applicationRetryMs } from '../../js/src/jobs/application-retries.js';

/** Finite time/effect seams; no five-hour timer or live HH account is used. */
export const applicationRetryFixture = (test, options = {}) => {
  const clock = { value: Date.UTC(2026, 10, 14) };
  const fixture = applicationDeferralFixture({
    ...options,
    application: { ...options.application, now: () => clock.value },
    readSearch: async (url) =>
      validateVacancySearch(
        searchFixture(url, [{ ...vacancySnapshotFixture(), responded: false }]),
        url
      ),
  });
  const { state, serviceOptions } = fixture;
  const dispatch = serviceOptions.application.dispatch;
  serviceOptions.application.dispatch = async (...args) => {
    if (
      args[2] === 'submit' &&
      (state.rejectSubmission || state.unknownSubmission)
    ) {
      state.submitted++;
      if (state.unknownSubmission) {
        throw Object.assign(new Error('Finite native send reply loss'), {
          code: 'fixture-lost-send',
        });
      }
      state.page.error = state.rejectSubmission;
      return { dispatched: true };
    }
    return dispatch(...args);
  };
  fixture.service = createVacancyService(serviceOptions);
  test.after(() => fixture.close());
  return Object.assign(fixture, {
    clock,
    async genericError(receipt) {
      state.page.error = 'generic-error';
      return fixture.service['application-read'](identity(receipt));
    },
  });
};

/** Start read-triggered queue tests from a fully preserved generic-error form. */
export const queuedGenericApplication = async (test) => {
  const fixture = applicationRetryFixture(test);
  const closed = await fixture.genericError(await fixture.answered());
  const [entry] = (await fixture.queue()).entries;
  return Object.assign(fixture, { entry, closedReceipt: closed });
};

/** Start reservation-release tests with one actual failed send and a due queue. */
export const dueRejectedApplication = async (test, options = {}) => {
  const fixture = applicationRetryFixture(test, options);
  const answered = await fixture.answered();
  fixture.state.rejectSubmission = 'generic-error';
  const closed = await fixture.service['application-advance'](
    identity(answered, { action: 'submit', confirm: true })
  );
  const [entry] = (await fixture.queue()).entries;
  fixture.clock.value += applicationRetryMs;
  return Object.assign(fixture, { entry, closedReceipt: closed });
};
