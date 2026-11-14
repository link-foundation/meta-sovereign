import { automaticReviewFields } from '../forms/automatic-prefill.js';
import {
  applicationDelay as delay,
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import { applicationSelectors } from './application-page.js';
import { nativeApplicationFields } from './application-review.js';

export class ApplicationActions {
  constructor(service) {
    this.service = service;
  }
  async settle(record, action, signal) {
    for (let count = 0; count < 20; count += 1) {
      signal.throwIfAborted();
      const page = await this.service.readPage(record.browser, record.url);
      if (
        page.delivered ||
        page.challenge ||
        page.dailyLimit ||
        page.external ||
        (action === 'enter' && page.submit)
      ) {
        break;
      }
      await delay(100, signal);
    }
    return this.service.review.inspect(record, signal);
  }
  async click(record, action, signal) {
    const service = this.service;
    await service.review.check(record, action, signal);
    const handle = await service.target(
      record.browser.page,
      applicationSelectors[action]
    );
    if (!handle) {
      throw fail('changed');
    }
    const prior = globalThis.structuredClone({
      attempted: record.attempted,
      delivery: record.delivery,
      state: record.state,
    });
    let reserved = false;
    let issued = false;
    try {
      signal.throwIfAborted();
      // A failed/lost dispatch remains unknown. A definitive synchronous refusal
      // below is the only path which can release this reservation.
      record.attempted[action] = true;
      record.delivery = 'unknown';
      record.state = 'sending';
      await service.save(record);
      reserved = true;
      signal.throwIfAborted();
      await service.review.check(record, action, signal);
      issued = true;
      const result = await service.dispatch(handle, record, action);
      if (result?.dispatched === false) {
        issued = false;
        reserved = false;
        Object.assign(record, prior);
        await service.save(record);
        return service.review.inspect(record, signal);
      }
      if (result?.dispatched !== true) {
        throw fail('unconfirmed');
      }
      service.trace({ event: 'application-dispatched', action });
    } catch (error) {
      if (reserved && !issued) {
        Object.assign(record, prior);
        await service.save(record);
      }
      service.trace({
        event: 'application-dispatch-refused',
        action,
        reserved,
        code: error.code ?? 'unknown',
      });
      throw error;
    } finally {
      await handle.dispose();
    }
    return this.settle(record, action, signal);
  }
  admitAdvance(record, input) {
    if (!['enter', 'submit'].includes(input.action) || input.confirm !== true) {
      throw fail('confirmation');
    }
    if (input.automatic !== undefined && typeof input.automatic !== 'boolean') {
      throw fail('input');
    }
    if (record.attempted[input.action]) {
      throw fail('already-attempted');
    }
    if (
      record.state !== (input.action === 'enter' ? 'ready' : 'review') ||
      record.delivery === 'provider-confirmed'
    ) {
      throw fail('state');
    }
    this.admitSubmit(record, input);
  }
  admitSubmit(record, input) {
    if (
      input.action === 'submit' &&
      (!record.page.scope || !record.vacancy || !record.report)
    ) {
      throw fail('state');
    }
    if (
      input.action === 'submit' &&
      record.options.coverLetter &&
      record.letter !== 'verified'
    ) {
      throw fail('letter');
    }
  }
  async advance(record, input, signal) {
    this.admitAdvance(record, input);
    if (record.options.testMode) {
      return { ...applicationView(record), state: 'test-preview' };
    }
    if (input.automatic === true) {
      if (
        input.action !== 'submit' ||
        !record.options.autoExact ||
        !record.exact
      ) {
        throw fail('exact');
      }
      const guard = record.guard;
      record.state = 'review-delay';
      await delay(record.options.reviewDelayMs, signal);
      await this.service.review.inspect(record, signal);
      if (
        !record.exact ||
        record.state !== 'review' ||
        record.guard.page !== guard.page ||
        record.guard.report !== guard.report
      ) {
        return applicationView(record);
      }
    }
    return this.click(record, input.action, signal);
  }
  async letter(record, signal) {
    const service = this.service;
    if (
      !record.page.letter &&
      record.page.letterToggle &&
      !record.page.letterToggle.disabled
    ) {
      await service.review.check(record, 'submit', signal);
      const toggle = await service.target(
        record.browser.page,
        applicationSelectors.letterToggle
      );
      if (!toggle) {
        throw fail('changed');
      }
      try {
        const result = await service.dispatch(toggle, record, 'letterToggle');
        if (!result?.dispatched) {
          throw fail('changed');
        }
      } finally {
        await toggle.dispose();
      }
      for (let count = 0; count < 20; count += 1) {
        const page = await service.readPage(record.browser, record.url);
        if (!page.bound || page.challenge || page.dailyLimit || page.letter) {
          break;
        }
        await delay(50, signal);
      }
      await service.review.inspect(record, signal);
    }
    if (record.state !== 'review' || !record.page.scope) {
      return;
    }
    await service.review.check(record, 'submit', signal);
    const result = await service.writeLetter(
      record.browser,
      record.options.coverLetter,
      record.page,
      record.url
    );
    await service.review.inspect(record, signal);
    record.letter = result;
    await service.save(record);
  }
  async prefill(record, input, signal) {
    const service = this.service;
    if (input.confirm !== true) {
      throw fail('confirmation');
    }
    if (record.options.testMode) {
      return { ...applicationView(record), state: 'test-preview' };
    }
    if (
      record.state !== 'review' ||
      record.attempted.submit ||
      !record.page.scope
    ) {
      throw fail('state');
    }
    await service.review.check(record, 'submit', signal);
    if (record.options.coverLetter) {
      await this.letter(record, signal);
      if (record.letter !== 'verified') {
        return applicationView(record);
      }
    }
    if (record.state !== 'review') {
      return applicationView(record);
    }
    const native = new Set(
      nativeApplicationFields(record.report, record.page).map(
        (field) => field.id
      )
    );
    const fields = automaticReviewFields(record.report)
      .filter(
        (field) => native.has(field.id) && field.answer.source === 'exact'
      )
      .map((field) => field.id)
      .slice(0, 25);
    if (fields.length) {
      await service.filling.apply(
        record,
        { planId: record.report.reviewPlan.id, fields },
        () => signal.throwIfAborted()
      );
    }
    const result = await service.review.inspect(record, signal);
    if (
      !record.options.autoExact ||
      !record.exact ||
      record.state !== 'review'
    ) {
      return result;
    }
    return this.advance(
      record,
      { action: 'submit', confirm: true, automatic: true },
      signal
    );
  }
  async mode(record, input, signal) {
    if (
      !['noQuestionnaires', 'paused'].some(
        (name) => input[name] !== undefined
      ) ||
      ['noQuestionnaires', 'paused'].some(
        (name) => input[name] !== undefined && typeof input[name] !== 'boolean'
      )
    ) {
      throw fail('input');
    }
    for (const name of ['noQuestionnaires', 'paused']) {
      if (input[name] !== undefined) {
        record[name] = input[name];
      }
    }
    return this.service.review.inspect(record, signal);
  }
}
