import { automaticReviewFields } from '../forms/automatic-prefill.js';
import {
  applicationDelay as delay,
  applicationFailure as fail,
  applicationView,
  applicationKey,
  applicationCanReenter,
} from './application-options.js';
import { applicationSelectors } from './application-page.js';
import { nativeApplicationFields } from './application-review.js';
import { readApplicationJournal } from './application-journal.js';
import {
  applicationLetterRequested,
  applicationLetterText,
  applicationLetterTemplate,
} from './application-letters.js';

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
        page.error ||
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
      popupReview: record.popupReview ?? false,
    });
    let reserved = false;
    let issued = false;
    try {
      signal.throwIfAborted();
      // A failed/lost dispatch remains unknown. A definitive synchronous refusal
      // below is the only path which can release this reservation.
      record.attempted[action] = true;
      // Consumed in the same acknowledged reservation as this new dispatch.
      record.popupReview = false;
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
    if (
      !['enter', 'reenter', 'submit'].includes(input.action) ||
      input.confirm !== true
    ) {
      throw fail('confirmation');
    }
    if (input.automatic !== undefined && typeof input.automatic !== 'boolean') {
      throw fail('input');
    }
    if (input.action === 'reenter' && !applicationCanReenter(record)) {
      throw fail('already-attempted');
    }
    if (input.action !== 'reenter' && record.attempted[input.action]) {
      throw fail('already-attempted');
    }
    if (
      record.state !== (input.action === 'submit' ? 'review' : 'ready') ||
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
      applicationLetterRequested(record.options) &&
      record.letter !== 'verified'
    ) {
      throw fail('letter');
    }
  }
  async reviewAutomatic(record, input, signal) {
    if (
      input.action !== 'submit' ||
      !record.options.autoExact ||
      !record.exact ||
      record.hold
    ) {
      throw fail('exact');
    }
    const guard = record.guard;
    record.state = 'review-delay';
    this.service.trace({
      event: 'application-review-delay',
      delayMs: record.options.reviewDelayMs,
    });
    await delay(record.options.reviewDelayMs, signal);
    await this.service.review.inspect(record, signal);
    if (
      !record.exact ||
      record.hold ||
      record.state !== 'review' ||
      record.guard.page !== guard.page ||
      record.guard.report !== guard.report
    ) {
      return false;
    }
    return true;
  }
  async advance(record, input, signal) {
    if (input.action === 'reenter' && !applicationCanReenter(record)) {
      throw fail('already-attempted');
    }
    if (
      input.action === 'form' ||
      ((record.options.autoSelectResumeLanguage ||
        record.options.standardLetters) &&
        ['enter', 'reenter'].includes(input.action))
    ) {
      const result = await this.service.fullForm.open(record, input, signal);
      if (result.state !== 'review') {
        return result;
      }
      await this.service.language.ensure(record, signal);
      return applicationView(record);
    }
    this.admitAdvance(record, input);
    if (input.action === 'reenter') {
      this.service.trace({
        event: 'application-popup-reentry-reviewed',
        preview: record.options.testMode,
      });
    }
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    await this.service.language.ensure(record, signal);
    this.admitSubmit(record, input);
    if (
      input.automatic === true &&
      !(await this.reviewAutomatic(record, input, signal))
    ) {
      return applicationView(record);
    }
    return this.click(
      record,
      input.action === 'reenter' ? 'enter' : input.action,
      signal
    );
  }
  async showLetter(record, signal, policy = () => signal.throwIfAborted()) {
    const service = this.service;
    policy();
    if (
      !record.page.letter &&
      record.page.letterToggle &&
      !record.page.letterToggle.disabled
    ) {
      await service.review.check(record, 'submit', signal);
      policy();
      const toggle = await service.target(
        record.browser.page,
        applicationSelectors.letterToggle
      );
      if (!toggle) {
        throw fail('changed');
      }
      try {
        policy();
        const result = await service.dispatch(toggle, record, 'letterToggle');
        if (!result?.dispatched) {
          throw fail('changed');
        }
      } finally {
        await toggle.dispose();
      }
      for (let count = 0; count < 20; count += 1) {
        policy();
        const page = await service.readPage(record.browser, record.url);
        policy();
        if (
          !page.bound ||
          page.challenge ||
          page.dailyLimit ||
          page.error ||
          page.letter
        ) {
          break;
        }
        await delay(50, signal);
      }
      policy();
      await service.review.inspect(record, signal);
      policy();
    }
  }
  async letter(record, signal) {
    const service = this.service;
    const text = applicationLetterText(record);
    const resume = record.letterResume;
    if (!text) {
      throw fail('letter');
    }
    await this.showLetter(record, signal);
    if (record.state !== 'review' || !record.page.scope) {
      return;
    }
    await service.review.check(record, 'submit', signal);
    const result = await service.writeLetter(
      record.browser,
      text,
      record.page,
      record.url,
      record.letterTemplate?.text
    );
    if (result === 'verified' && record.options.standardLetters) {
      record.letterTemplate = applicationLetterTemplate(
        {
          hash: resume.hash,
          title: resume.title,
          language: resume.languageProof.language,
          text,
        },
        record.options
      );
      // Persist before any later inspection can fail; a failed save removes authority.
      await service.save(record);
    }
    await service.review.inspect(record, signal);
    record.letter = result;
    await service.save(record);
  }
  prefillPart(record, input) {
    if (input.confirm !== true) {
      throw fail('confirmation');
    }
    const part = input.part === undefined ? 'all' : input.part;
    if (!['all', 'answers', 'cover-letter'].includes(part)) {
      throw fail('input');
    }
    if (record.options.supervised && part === 'all') {
      throw fail('confirmation');
    }
    return part;
  }
  async answers(record, signal) {
    const service = this.service;
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
  }
  async prefill(record, input, signal) {
    const service = this.service;
    const part = this.prefillPart(record, input);
    if (record.options.testMode) {
      return applicationView({ ...record, state: 'test-preview' });
    }
    if (
      record.state !== 'review' ||
      record.attempted.submit ||
      !record.page.scope
    ) {
      throw fail('state');
    }
    await service.review.check(record, 'submit', signal);
    await service.language.ensure(record, signal);
    if (part !== 'answers' && applicationLetterRequested(record.options)) {
      await this.letter(record, signal);
      if (record.letter !== 'verified') {
        return applicationView(record);
      }
    }
    if (record.state !== 'review') {
      return applicationView(record);
    }
    if (part !== 'cover-letter') {
      await this.answers(record, signal);
    }
    const result = await service.review.inspect(record, signal);
    if (
      part !== 'all' ||
      !record.options.autoExact ||
      record.hold ||
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
  async changeMode(input, signal) {
    const service = this.service;
    if (service.current) {
      return this.mode(service.owned(input), input, signal);
    }
    const key = applicationKey(input);
    const record = readApplicationJournal(await service.store.get(key.id), key);
    record.hold = service.holds.read(key.id);
    if (
      input.requestId !== record.requestId ||
      input.revision !== record.revision
    ) {
      throw fail('changed');
    }
    record.acknowledged = globalThis.structuredClone(record);
    Object.assign(record, service.modes.read(record.browserSlot), {
      state:
        record.delivery === 'provider-confirmed' ? 'delivered' : 'interrupted',
    });
    return this.mode(record, input, signal);
  }
  async mode(record, input, signal) {
    const service = this.service;
    const version = service.modes.version(record.browserSlot);
    const modes = service.modes.change(record.browserSlot, input);
    Object.assign(record, modes);
    try {
      if (!record.active) {
        signal.throwIfAborted();
        await service.save(record);
      }
      const result = record.active
        ? await service.review.inspect(record, signal)
        : applicationView(record);
      if (service.modes.version(record.browserSlot) === version) {
        service.modes.save(record.browserSlot, modes);
        return result;
      }
      service.modes.apply(record);
      return applicationView(record);
    } catch (error) {
      service.modes.apply(record);
      throw error;
    }
  }
}
