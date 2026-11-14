import {
  applicationFixture,
  applicationInput,
} from './application-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const applicationFullFormFixture = async (t, options = {}) => {
  const fixture = applicationFixture(options);
  await fixture.service.stop();
  const openSession = fixture.serviceOptions.openSession;
  fixture.serviceOptions.openSession = async (...args) => {
    const browser = await openSession(...args);
    browser.page.waitForURL = async (matches) => {
      if (fixture.state.navigationFailure) {
        throw fixture.state.navigationFailure;
      }
      if (!matches(new URL(fixture.state.page.url))) {
        throw new Error('Synthetic full-form navigation did not arrive');
      }
      fixture.state.navigationReady = true;
    };
    return browser;
  };
  const dispatch = fixture.serviceOptions.application.dispatch;
  fixture.serviceOptions.application.dispatch = async (...args) => {
    if (args[2] !== 'fullForm') {
      return dispatch(...args);
    }
    fixture.state.navigated = (fixture.state.navigated ?? 0) + 1;
    Object.assign(fixture.state.page, {
      url: 'https://hh.ru/applicant/vacancy_response?vacancyId=123&startedWithQuestion=false',
      documentKey: 'full-form-document',
      enter: null,
      submit: { qa: 'vacancy-response-letter-submit', disabled: false },
      scope: true,
      questions: true,
      fieldIndices: [1],
      questionIndices: [1],
    });
    return { navigated: true };
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  if (options.open !== false) {
    fixture.opened = await fixture.service['application-open']({
      ...applicationInput,
      ...options.input,
    });
  }
  fixture.form = (receipt = fixture.opened, extra = {}) =>
    fixture.service['application-advance'](
      applicationIdentity(receipt, { action: 'form', confirm: true, ...extra })
    );
  t.after(() => fixture.close());
  return fixture;
};
