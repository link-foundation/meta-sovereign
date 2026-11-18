import {
  applicationFixture,
  applicationInput,
} from './application-fixture.mjs';
import { configureApplicationFullForm } from './application-fullform-fixture.mjs';
import { applicationIdentity } from './application-run-fixture.mjs';
import { createVacancyService } from '../../js/src/jobs/service.js';

export const originalApplicationSearch =
  'https://hh.ru/search/vacancy?text=Python&area=1&page=2&experience=between3And6';

export const applicationSearchRouteFixture = async (t, input = {}) => {
  const fixture = await configureApplicationFullForm(applicationFixture());
  await fixture.service.stop();
  const { state } = fixture;
  state.routes = [];
  const dispatch = fixture.serviceOptions.application.dispatch;
  fixture.serviceOptions.application.dispatch = async (...args) => {
    if (args[2] !== 'search') {
      return dispatch(...args);
    }
    state.routes.push(args[1].options.applicationSearchUrl);
    state.page = {
      ...state.page,
      bound: false,
      url: args[1].options.applicationSearchUrl,
      documentKey: 'original-search',
      enter: null,
      searchBound: true,
      searchReady: true,
      searchKey: 'original-fields',
    };
    return { navigated: true };
  };
  fixture.serviceOptions.application.searchPage = async (
    _browser,
    record,
    guard
  ) => {
    await state.searchCheckpoint?.(guard);
    if (guard === undefined) {
      return globalThis.structuredClone(state.page);
    }
    if (guard !== JSON.stringify(state.page)) {
      return { navigated: false };
    }
    state.routes.push('full-form');
    const result = await dispatch(null, record, 'fullForm');
    state.page.bound = true;
    return result;
  };
  fixture.service = createVacancyService(fixture.serviceOptions);
  fixture.opened = await fixture.service['application-open']({
    ...applicationInput,
    applyFromVacancyPage: false,
    applicationSearchUrl: originalApplicationSearch,
    ...input,
  });
  fixture.form = (receipt = fixture.opened, extra = {}) =>
    fixture.service['application-advance'](
      applicationIdentity(receipt, {
        action: 'enter',
        confirm: true,
        ...extra,
      })
    );
  t.after(() => fixture.close());
  return fixture;
};
