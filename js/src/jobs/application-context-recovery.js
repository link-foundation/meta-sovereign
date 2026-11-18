import { applicationPreservationPolicy } from './application-run-modes.js';
import { applicationResumeUrl } from './application-location.js';
import { applicationFailure as fail } from './application-options.js';

const canRecoverContext = (record) =>
  !record.contextRecovering &&
  !record.vacancy &&
  ['review', 'deferred'].includes(record.state) &&
  record.page.scope &&
  record.page.bound &&
  !record.hold &&
  !record.paused &&
  !record.attempted.submit &&
  record.delivery === 'none' &&
  !record.options.testMode;

/** Preserve the actual direct form before reading its missing vacancy context. */
export class ApplicationContextRecovery {
  constructor(service) {
    this.service = service;
  }
  async recover(record, signal) {
    if (!canRecoverContext(record)) {
      return;
    }
    const service = this.service;
    const formUrl = applicationResumeUrl(record.page.url, record.url);
    const policy = applicationPreservationPolicy(service, record, signal);
    record.contextRecovering = true;
    try {
      policy();
      if (record.page.fieldIndices.length) {
        await service.deferrals.preserve(
          record,
          { confirm: true },
          signal,
          policy
        );
      } else {
        await service.review.check(record, 'submit', signal, true);
      }
      policy();
      record.resumeUrl = formUrl;
      await service.save(record);
      await service.review.check(record, 'submit', signal, true);
      policy();
      const failure = await this.visitVacancy(record, formUrl, signal, policy);
      policy();
      await service.review.inspect(record, signal);
      if (record.page.url !== formUrl || !record.page.scope) {
        throw fail('changed');
      }
      await this.restore(record, signal, policy);
      if (failure) {
        throw failure;
      }
      service.trace({
        event: 'application-context-recovered',
        fields: record.draft?.fields.length ?? 0,
      });
    } catch (error) {
      record.guard = null;
      record.exact = false;
      service.trace({
        event: 'application-context-recovery-held',
        code: error.code ?? 'unknown',
      });
      throw error;
    } finally {
      record.contextRecovering = false;
    }
  }
  async visitVacancy(record, formUrl, signal, policy) {
    const service = this.service;
    try {
      await record.browser.commander.goto({
        url: record.url,
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      policy();
      const page = await service.readPage(record.browser, record.url);
      if (
        !page.bound ||
        page.url !== record.url ||
        page.scope ||
        page.challenge ||
        page.external ||
        page.resumeNotVisible
      ) {
        throw fail('vacancy');
      }
      await service.review.vacancy(record, signal);
    } catch (error) {
      return error;
    } finally {
      await this.returnToForm(record, formUrl, signal, policy);
    }
  }
  async returnToForm(record, formUrl, signal, policy) {
    // A slow read or cache acknowledgement cannot navigate over an owner
    // change. The saved draft remains available if the form cannot return.
    if (this.service.current !== record || signal.aborted) {
      return;
    }
    const current = await this.service.readPage(record.browser, record.url);
    if (current.bound && current.url === record.url && !current.scope) {
      policy();
      await record.browser.commander.goto({
        url: formUrl,
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
    }
  }
  async restore(record, signal, policy) {
    if (!record.draft) {
      return;
    }
    if (
      record.draft.fields.length > record.page.fieldIndices.length &&
      record.page.letterToggle
    ) {
      await this.service.actions.showLetter(record, signal, policy);
    }
    await this.service.drafts.restore(
      record,
      { confirm: true },
      signal,
      policy
    );
    if (record.restoration?.state !== 'restored') {
      throw fail('changed');
    }
  }
}
