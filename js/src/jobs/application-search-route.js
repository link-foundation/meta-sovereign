import {
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import { applicationAttachmentStatus } from './application-letters.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import { applicationRouteView } from './application-route-settings.js';
import { sameSearch } from './options.js';

/** Return only when a confirmed application and its letter have finished. */
export const returnDeliveredApplicationToSearch = async (
  service,
  record,
  signal
) => {
  const status = applicationAttachmentStatus(record);
  if (
    record.delivery !== 'provider-confirmed' ||
    record.state !== 'delivered' ||
    record.hold ||
    record.paused ||
    record.recruiterChat ||
    record.options.testMode ||
    record.attachmentSearchActive ||
    record.page.attachment?.pending ||
    (status && status !== 'provider-confirmed') ||
    (record.options.applyFromVacancyPage !== false &&
      !record.options.applicationSearchUrl)
  ) {
    return applicationView(record);
  }
  const { browser } = record;
  const { applicationSearchUrl } = applicationRouteView(record.options);
  signal.throwIfAborted();
  try {
    const result = await service.attachmentDocument(
      browser,
      record,
      'returnSearch',
      record.guard.page
    );
    if (result?.navigated !== true) {
      return applicationView(record);
    }
  } catch (error) {
    signal.throwIfAborted();
    service.trace({
      event: 'application-delivered-search-dispatch',
      code: error.name,
    });
    if (!sameSearch(browser.page.url?.(), applicationSearchUrl)) {
      return applicationView(record);
    }
  }
  record.returnedToSearch = true;
  record.attachmentSearchActive = true;
  record.attachmentSearchTried = true;
  try {
    await browser.page.waitForURL(
      (url) => sameSearch(url.href, applicationSearchUrl),
      {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      }
    );
  } catch (error) {
    service.trace({
      event: 'application-delivered-search-wait',
      code: error.name,
    });
  }
  service.trace({ event: 'application-delivered-search-observe' });
  return service.review.inspect(record, signal);
};

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
