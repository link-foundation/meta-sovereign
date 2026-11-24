import {
  applicationAttachmentPage,
  applicationAttachmentStatus,
  applicationLetterText,
} from './application-letters.js';
import { applicationSelectors } from './application-page.js';
import {
  applicationDelay,
  applicationFailure as fail,
  applicationPageKey,
  applicationView,
} from './application-options.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import { applicationRouteView } from './application-route-settings.js';
import { returnDeliveredApplicationToSearch } from './application-search-route.js';
import { sameSearch } from './options.js';

const popup = (page) => {
  const attachment = applicationAttachmentPage(page);
  return attachment?.submit ? attachment : null;
};
const confirmation = (page, documentKey) => {
  const attachment = applicationAttachmentPage(page);
  return (
    page.documentKey === documentKey &&
    attachment &&
    !attachment.pending &&
    !attachment.offer &&
    !attachment.submit
  );
};

/** Cover-letter delivery has its own reservation on an already delivered vacancy. */
export class ApplicationAttachment {
  constructor(service) {
    this.service = service;
  }

  readPage(record) {
    const { service } = this;
    return record.attachmentSearchActive
      ? service.attachmentDocument(record.browser, record)
      : service.readPage(record.browser, record.url);
  }

  async read(record, check, expectedKey) {
    const page = await this.readPage(record);
    await this.service.limits.observe(record, page);
    check();
    if (
      !applicationAttachmentPage(page) ||
      (expectedKey && applicationPageKey(page) !== expectedKey)
    ) {
      throw fail('changed');
    }
    return page;
  }

  async search(record, check, signal) {
    const { service } = this;
    const { browser, url } = record;
    check();
    const opened = await service.attachmentDocument(
      browser,
      record,
      'attachmentSearch',
      record.guard.page
    );
    if (opened?.navigated !== true) {
      throw fail('changed');
    }
    record.attachmentSearchTried = true;
    record.attachmentSearchActive = true;
    record.attachmentObserved = true;
    await service.save(record);
    const { applicationSearchUrl } = applicationRouteView(record.options);
    await browser.page
      .waitForURL((current) => sameSearch(current.href, applicationSearchUrl), {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      })
      .catch((error) => {
        service.trace({
          event: 'application-attachment-search-wait',
          code: error.name,
        });
      });
    check();
    const page = await this.readPage(record);
    if (page.returnSafe && !page.attachment?.offer) {
      check();
      const fallback = await service.attachmentDocument(
        browser,
        record,
        'attachmentVacancy',
        applicationPageKey(page)
      );
      if (fallback?.navigated === true) {
        await browser.page.waitForURL(url, {
          waitUntil: 'domcontentloaded',
          timeout: 5000,
        });
        record.attachmentSearchActive = false;
      }
    }
    await service.review.inspect(record, signal);
    check();
    return applicationAttachmentStatus(record) === 'offered'
      ? this.prepare(
          record,
          record.page,
          applicationLetterText(record),
          check,
          signal
        )
      : applicationView(record);
  }

  async openOffer(record, page, check) {
    const { service } = this;
    if (page.attachmentSearch) {
      check();
      return service.attachmentDocument(
        record.browser,
        record,
        'attachmentOpen',
        record.guard.page
      );
    }
    const handle = await service.target(
      record.browser.page,
      applicationSelectors.attachmentOpen
    );
    if (!handle) {
      throw fail('changed');
    }
    try {
      check();
      return await service.dispatch(handle, record, 'attachmentOpen');
    } finally {
      await handle.dispose();
    }
  }

  async prepare(record, page, text, check, signal) {
    const { service } = this;
    if (!popup(page)) {
      const result = await this.openOffer(record, page, check);
      if (result?.dispatched !== true) {
        throw fail('changed');
      }
      const documentKey = page.documentKey;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        page = await this.read(record, check);
        if (page.documentKey !== documentKey) {
          throw fail('changed');
        }
        if (popup(page)) {
          break;
        }
        await applicationDelay(100, signal);
      }
    }
    // A native draft can appear when the popup opens. Keep it if the owner wrote it.
    if (popup(page)?.value === '') {
      check();
      await service.writeLetter(
        record.browser,
        text,
        page,
        record.url,
        undefined,
        'attachmentWrite',
        applicationRouteView(record.options).applicationSearchUrl
      );
    }
    return service.review.inspect(record, signal);
  }

  async send(record, page, text, check, signal) {
    const { service } = this;
    const handle = await service.target(
      record.browser.page,
      applicationSelectors.attachmentSend
    );
    if (!handle) {
      throw fail('changed');
    }
    try {
      check();
      record.attachmentDelivery = 'unknown';
      await service.save(record);
      const result = await this.dispatchReserved(handle, record, text, check);
      if (result?.dispatched !== true) {
        throw fail('unconfirmed');
      }
      service.trace({ event: 'application-attachment-dispatched' });
    } finally {
      await handle.dispose();
    }
    await this.settle(record, page.documentKey, signal);
    return returnDeliveredApplicationToSearch(service, record, signal);
  }

  async dispatchReserved(handle, record, text, check) {
    const { service } = this;
    try {
      await this.read(record, check, record.guard.page);
    } catch (error) {
      record.attachmentDelivery = null;
      await service.save(record);
      throw error;
    }
    const result = await service.dispatch(
      handle,
      record,
      'attachmentSend',
      text
    );
    if (result?.dispatched === false) {
      record.attachmentDelivery = null;
      await service.save(record);
    }
    return result;
  }

  async settle(record, documentKey, signal) {
    const { service } = this;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      signal.throwIfAborted();
      const page = await this.readPage(record);
      if (confirmation(page, documentKey)) {
        await applicationDelay(100, signal);
        await service.review.inspect(record, signal);
        if (confirmation(record.page, documentKey)) {
          record.attachmentDelivery = 'provider-confirmed';
          await service.save(record);
          service.trace({ event: 'application-attachment-confirmed' });
        }
        return;
      }
      if (
        page.documentKey !== documentKey ||
        !applicationAttachmentPage(page)
      ) {
        break;
      }
      await applicationDelay(100, signal);
    }
    await service.review.inspect(record, signal);
  }

  async advance(record, input, signal) {
    if (input.confirm !== true || input.automatic !== undefined) {
      throw fail('confirmation');
    }
    if (record.attachmentDelivery) {
      throw fail('already-attempted');
    }
    const status = applicationAttachmentStatus(record);
    const preparing = input.action === 'letter-prepare';
    if (
      record.state !== 'delivered' ||
      !record.guard ||
      !(preparing
        ? ['offered', 'draft', 'search'].includes(status)
        : status === 'ready')
    ) {
      throw fail('state');
    }
    const check = applicationPreservationPolicy(this.service, record, signal);
    const page =
      status === 'search'
        ? record.page
        : await this.read(record, check, record.guard.page);
    await this.service.limits.admit(record);
    check();
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    if (status === 'search') {
      return this.search(record, check, signal);
    }
    const text = applicationLetterText(record);
    return preparing
      ? this.prepare(record, page, text, check, signal)
      : this.send(record, page, text, check, signal);
  }
}
