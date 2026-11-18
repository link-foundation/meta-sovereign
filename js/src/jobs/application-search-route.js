import { applicationFailure as fail } from './application-options.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import { applicationRouteView } from './application-route-settings.js';
import { sameSearch } from './options.js';

/** Read-only navigation; no entry/send reservation or native Apply click. */
export const enterApplicationSearch = async (
  service,
  record,
  handle,
  signal
) => {
  const policy = applicationPreservationPolicy(service, record, signal);
  const admit = () => {
    policy();
    if (record.hold || record.attempted.submit || record.delivery !== 'none') {
      throw fail('state');
    }
    service.salary.admit(record);
  };
  admit();
  const result = await service.dispatch(handle, record, 'search');
  if (result?.navigated !== true) {
    throw fail('changed');
  }
  service.trace({ event: 'application-return-search-navigation' });
  const { applicationSearchUrl } = applicationRouteView(record.options);
  await record.browser.page.waitForURL(
    (url) => sameSearch(url.href, applicationSearchUrl),
    { waitUntil: 'domcontentloaded', timeout: 5000 }
  );
  admit();
  const page = await service.searchPage(record.browser, record);
  admit();
  if (
    !page.searchBound ||
    !page.searchReady ||
    page.challenge ||
    page.dailyLimit ||
    page.error ||
    page.external ||
    page.delivered ||
    page.questions ||
    page.scope ||
    page.submit
  ) {
    throw fail('changed');
  }
  await service.questionDeferrals.assertAllowed(record, signal);
  await service.limits.admit(record);
  admit();
  const opened = await service.searchPage(
    record.browser,
    record,
    JSON.stringify(page)
  );
  if (opened?.navigated !== true) {
    throw fail('changed');
  }
  service.trace({ event: 'application-search-full-form-navigation' });
};
