import {
  applicationFailure as fail,
  applicationView,
  applicationCanReenter,
} from './application-options.js';
import { applicationSelectors } from './application-page.js';

const admitFullForm = (record) => {
  if (
    record.state !== 'ready' ||
    record.page.scope ||
    record.page.submit ||
    record.page.questions ||
    (record.attempted.enter &&
      !(
        record.options.autoSelectResumeLanguage && applicationCanReenter(record)
      )) ||
    record.attempted.submit ||
    record.delivery !== 'none' ||
    !record.vacancy ||
    record.hold
  ) {
    throw fail('state');
  }
};

/** Review the native form without clicking an entry control that may send immediately. */
export class ApplicationFullForm {
  constructor(service) {
    this.service = service;
  }
  async open(record, input, signal) {
    if (
      input.confirm !== true ||
      (input.automatic !== undefined && input.automatic !== false)
    ) {
      throw fail('confirmation');
    }
    admitFullForm(record);
    const service = this.service;
    await service.review.check(record, 'enter', signal);
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    const handle = await service.target(
      record.browser.page,
      applicationSelectors.enter
    );
    if (!handle) {
      throw fail('changed');
    }
    try {
      signal.throwIfAborted();
      const result = await service.dispatch(handle, record, 'fullForm');
      if (result?.navigated !== true) {
        throw fail('changed');
      }
      service.trace({ event: 'application-full-form-navigation' });
    } finally {
      await handle.dispose();
    }
    const expected = new URL(record.url);
    await record.browser.page.waitForURL(
      (url) =>
        url.origin === expected.origin &&
        url.pathname === '/applicant/vacancy_response' &&
        url.searchParams.getAll('vacancyId').length === 1 &&
        url.searchParams.get('vacancyId') ===
          expected.pathname.split('/').at(-1),
      { waitUntil: 'domcontentloaded', timeout: 5000 }
    );
    signal.throwIfAborted();
    service.trace({ event: 'application-full-form-document-ready' });
    return service.actions.settle(record, 'enter', signal);
  }
}
