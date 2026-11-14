import { createVacancyService } from '../../js/src/jobs/service.js';
import {
  applicationFixture,
  applicationPageFixture,
} from './application-fixture.mjs';

export const applicationFormUrl =
  'https://hh.ru/applicant/vacancy_response?vacancyId=123';

/** Each reopened browser starts a new document, rather than retaining the old mock page. */
export const applicationRecoveryFixture = ({
  popup = false,
  ...options
} = {}) => {
  const fixture = applicationFixture(options);
  const { state } = fixture;
  const originalOpen = fixture.serviceOptions.openSession;
  const originalDispatch = fixture.serviceOptions.application.dispatch;
  fixture.serviceOptions = {
    ...fixture.serviceOptions,
    openSession: async (options) => {
      const browser = await originalOpen(options);
      browser.commander.goto = async ({ url }) => {
        state.calls.push(['goto', url]);
        state.page = applicationPageFixture();
        if (url === applicationFormUrl) {
          Object.assign(state.page, {
            url,
            enter: null,
            submit: { qa: 'vacancy-response-letter-submit', disabled: false },
            questions: true,
            scope: true,
            fieldIndices: [1],
          });
        }
      };
      return browser;
    },
    application: {
      ...fixture.serviceOptions.application,
      dispatch: async (...args) => {
        const result = await originalDispatch(...args);
        if (args[2] === 'enter' && !popup) {
          state.page.url = applicationFormUrl;
        }
        return result;
      },
    },
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  return fixture;
};
