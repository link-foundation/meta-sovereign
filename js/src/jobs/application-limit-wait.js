import {
  applicationDelay,
  applicationFailure as fail,
  applicationKey,
  applicationView,
} from './application-options.js';
import { applicationWaitId } from './application-limit-wait-data.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import { applicationSelectors } from './application-page.js';

const canWait = (record) =>
  record.applicationLimit?.active &&
  record.applicationLimit.saved &&
  record.draft?.limit &&
  record.page.scope &&
  record.page.bound &&
  !record.page.challenge &&
  !record.page.external &&
  !record.page.delivered &&
  !record.paused &&
  !record.noQuestionnaires &&
  !record.options.testMode &&
  record.draft.limit.documentKey === record.page.documentKey;

/** A confirmed, finite wait owns no workspace writer while sleeping. */
export class ApplicationLimitWait {
  constructor(service, now, wait = applicationDelay) {
    Object.assign(this, { service, now, wait });
  }
  record(input) {
    const record = this.service.current;
    if (
      !record ||
      record.id !== applicationKey(input).id ||
      record.requestId !== input.requestId ||
      !applicationWaitId(input.waitId)
    ) {
      throw fail('missing');
    }
    return record;
  }
  async start(input) {
    const record = this.record(input);
    if (input.confirm !== true) {
      throw fail('confirmation');
    }
    // A repeated receipt lookup cannot re-arm an issued or completed navigation.
    if (record.limitWait?.id === input.waitId) {
      return this.service.status(input);
    }
    return this.service.operate(async (signal) => {
      this.service.owned(input);
      if (this.runtime) {
        throw fail('busy');
      }
      await this.service.review.inspect(record, signal);
      await this.service.limitBackups.automatic(signal);
      if (!canWait(record)) {
        throw fail('state');
      }
      const runtime = {
        controller: new AbortController(),
        record,
        documentKey: record.page.documentKey,
        url: record.page.url,
        policyVersion: this.service.modes.version(record.browserSlot),
      };
      record.limitWait = {
        id: input.waitId,
        phase: 'waiting',
        until: record.applicationLimit.until,
        code: null,
      };
      this.runtime = runtime;
      runtime.work = this.cycle(runtime).finally(() => {
        if (this.runtime === runtime) {
          this.runtime = null;
        }
      });
      runtime.work.catch(() => {});
      return applicationView(record);
    });
  }
  abort() {
    if (this.runtime) {
      this.runtime.record.limitWait.phase = 'stopped';
    }
    this.runtime?.controller.abort();
  }
  async drain() {
    this.abort();
    await this.runtime?.work;
  }
  async stop(input) {
    const record = this.record(input);
    if (record.limitWait?.id !== input.waitId) {
      throw fail('missing');
    }
    await this.drain();
    return this.service.status(input);
  }
  current(runtime, signal) {
    signal.throwIfAborted();
    const { record } = runtime;
    if (
      this.service.current !== record ||
      !record.active ||
      record.paused ||
      this.service.modes.version(record.browserSlot) !==
        runtime.policyVersion ||
      record.page.documentKey !== runtime.documentKey ||
      record.page.url !== runtime.url
    ) {
      throw fail('changed');
    }
  }
  async cycle(runtime) {
    const { record, controller } = runtime;
    try {
      while (record.limitWait.phase === 'waiting') {
        const remaining = Date.parse(record.limitWait.until) - this.now();
        // Even an injected clock must yield before the opening writer releases.
        await this.wait(
          Math.min(1000, remaining > 0 ? remaining : 1000),
          controller.signal
        );
        try {
          await this.service.operate((writerSignal) =>
            this.poll(
              runtime,
              globalThis.AbortSignal.any([writerSignal, controller.signal])
            )
          );
        } catch (error) {
          // An owner action wins admission; no deadline extension or immediate retry.
          if (error.code !== 'jobs-busy') {
            throw error;
          }
        }
      }
    } catch (error) {
      record.limitWait.phase = controller.signal.aborted
        ? 'stopped'
        : 'refused';
      record.limitWait.code = controller.signal.aborted
        ? null
        : (error.code ?? 'jobs-application-unavailable');
      this.service.trace({
        event: 'application-limit-wait-ended',
        phase: record.limitWait.phase,
        code: record.limitWait.code,
        checkpoint: runtime.checkpoint ?? 'poll',
        errorKind: error.name,
      });
    }
  }
  async poll(runtime, signal) {
    this.current(runtime, signal);
    const { service } = this;
    const { record } = runtime;
    await service.review.inspect(record, signal);
    this.current(runtime, signal);
    await service.limitBackups.automatic(signal);
    this.current(runtime, signal);
    if (this.now() < Date.parse(record.limitWait.until)) {
      return applicationView(record);
    }
    if (record.applicationLimit.active) {
      throw fail('limit-wait');
    }
    if (!record.page.dailyLimit) {
      record.limitWait.phase = 'review';
      return applicationView(record);
    }
    await this.refresh(runtime, signal);
    record.limitWait.phase = 'review';
    return applicationView(record);
  }
  async refresh(runtime, signal) {
    const { service } = this;
    const { record } = runtime;
    const policy = applicationPreservationPolicy(service, record, signal);
    const check = async () => {
      this.current(runtime, signal);
      policy();
      await service.review.check(record, 'submit', signal, true, 'daily-limit');
      if (record.draft?.limit?.documentKey !== record.page.documentKey) {
        throw fail('changed');
      }
    };
    await check();
    runtime.checkpoint = 'target';
    const target = await service.target(
      record.browser.page,
      applicationSelectors.submit
    );
    if (!target) {
      throw fail('changed');
    }
    try {
      await check();
      record.limitWait.phase = 'refreshing';
      runtime.checkpoint = 'dispatch';
      const result = await service.dispatch(target, record, 'limitRefresh');
      if (result?.navigated !== true) {
        throw fail('changed');
      }
    } finally {
      runtime.checkpoint = 'dispose';
      await target.dispose();
    }
    runtime.checkpoint = 'navigation';
    // A refused full form can already have the destination URL. URL readiness
    // alone would admit inspection of the old document during navigation.
    await record.browser.page.waitForFunction(
      ({ vacancy, documentKey }) => {
        const expected = new URL(vacancy);
        const url = new URL(globalThis.location.href);
        return (
          globalThis.document.readyState !== 'loading' &&
          globalThis.document[
            Symbol.for('meta-sovereign.jobs.application-document.v1')
          ] !== documentKey &&
          url.origin === expected.origin &&
          url.pathname === '/applicant/vacancy_response' &&
          url.searchParams.getAll('vacancyId').length === 1 &&
          url.searchParams.get('vacancyId') ===
            expected.pathname.split('/').at(-1)
        );
      },
      { vacancy: record.url, documentKey: runtime.documentKey },
      { timeout: 5000 }
    );
    signal.throwIfAborted();
    runtime.checkpoint = 'fresh-review';
    await service.review.inspect(record, signal);
    if (record.page.documentKey === runtime.documentKey) {
      throw fail('changed');
    }
    service.trace({
      event: 'application-limit-refreshed',
      reserved: record.attempted.submit,
    });
  }
}
