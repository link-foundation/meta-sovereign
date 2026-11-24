import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { acknowledgedRead } from './acknowledged-store.js';
import {
  applicationDelay,
  applicationFailure as fail,
  applicationPageKey,
  applicationView,
  applicationKey,
} from './application-options.js';
import {
  applicationBatchKey,
  applicationBatchOptions,
  applicationBatchView,
  applicationBatchTerminal,
  readApplicationBatch,
} from './application-batch-data.js';
import { storedVacancyChoices } from './vacancy-choice-service.js';
import { storedVacancySkips } from './vacancy-skip-service.js';
import { vacancySkipBlocks } from './vacancy-skip-policy.js';
import { pendingDeferredVacancies } from './deferred-questions.js';
import { vacancyChoiceSlot } from './vacancy-choice.js';
import { sameUnreadSkip } from '../automation/question-unread-polling-state.js';
import { applicationPreservationPolicy } from './application-run-modes.js';
import {
  ApplicationBatchSalary,
  batchSalaryFloor,
} from './application-batch-salary.js';
import {
  applyDiscoveryBatch,
  discoveryBatchRequestId,
  readDiscoveryBatch,
} from './application-batch-discovery.js';
import { applicationAttachmentStatus } from './application-letters.js';
import { applicationConfirmationPolicy } from './application-confirmations.js';

const observedOutcome = (page) =>
  page.bound &&
  (page.delivered ||
    page.dailyLimit ||
    page.challenge ||
    page.error ||
    page.resumeNotVisible ||
    page.vacancyUnavailable);
const excludedVacancy = (url, pending, choices, skips, context) =>
  pending.has(url) ||
  choices.entries.some((row) => row.url === url) ||
  skips.entries.some(
    (row) => row.url === url && vacancySkipBlocks(row, context)
  );
const owners = new WeakMap();
const latest = (slot) => `secret:jobs-application-batch-latest:${slot}`;
const attachmentActions = {
  search: ['letter-prepare', 'cover-letter'],
  offered: ['letter-prepare', 'cover-letter'],
  draft: ['letter-prepare', 'cover-letter'],
  ready: ['letter-send', 'send'],
};

/** Explicit finite batch. Sleeps release the writer; durable reads never arm work. */
export class ApplicationBatch {
  constructor(service, now, wait = applicationDelay) {
    Object.assign(this, { service, now, wait });
    this.salary = new ApplicationBatchSalary(this);
  }
  async status(input = {}) {
    return acknowledgedRead(this.service.store, async () => {
      const browserSlot = vacancyChoiceSlot(input);
      const requestId =
        input.requestId ??
        (await this.service.store.get(latest(browserSlot)))?.requestId;
      if (!requestId) {
        return applicationBatchView(null, false);
      }
      const key = applicationBatchKey({ browserSlot, requestId });
      const raw =
        this.runtime?.record.id === key.id
          ? this.runtime.record
          : await this.service.store.get(key.id);
      if (!raw) {
        return applicationBatchView(null, false);
      }
      const record = readApplicationBatch(raw, key);
      const current = this.service.current;
      const application =
        current?.url === record.currentUrl &&
        current.requestId === requestId &&
        current.browserSlot === browserSlot
          ? applicationView(current)
          : null;
      return applicationBatchView(
        record,
        this.runtime?.record.id === key.id,
        application,
        this.service.modes.read(browserSlot),
        this.runtime?.record.id === key.id ? this.runtime : null
      );
    });
  }
  async save(runtime, change) {
    const record = { ...runtime.record, ...change };
    if (JSON.stringify(record) === JSON.stringify(runtime.record)) {
      return;
    }
    record.revision = globalThis.crypto.randomUUID();
    readApplicationBatch(record, record.options);
    await saveAcknowledgedRecord(this.service.store, record);
    runtime.controller.signal.throwIfAborted();
    runtime.record = record;
  }
  async start(input) {
    if (input.confirm !== true) {
      throw fail('confirmation');
    }
    const key = applicationBatchKey(input);
    const discoveryId = input.discoveryRequestId;
    if (discoveryId !== undefined && input.urls !== undefined) {
      throw fail('batch-input');
    }
    const existing = await acknowledgedRead(this.service.store, () =>
      this.service.store.get(key.id)
    );
    const record = existing ? readApplicationBatch(existing, key) : null;
    if (record && record.options.discoveryRequestId !== discoveryId) {
      throw fail('conflict');
    }
    const source =
      discoveryId === undefined
        ? null
        : record
          ? { urls: record.options.urls, settings: record.options.review }
          : await readDiscoveryBatch(
              this.service.store,
              key,
              discoveryBatchRequestId(discoveryId)
            );
    const options = applicationBatchOptions(
      source ? applyDiscoveryBatch(input, source) : input
    );
    if (record) {
      if (record.signature !== JSON.stringify(options)) {
        throw fail('conflict');
      }
      return this.status(options);
    }
    await this.service.operate(async (signal) => {
      if (owners.has(this.service.store) || this.service.current) {
        throw fail('busy');
      }
      if (await this.service.store.get(options.id)) {
        throw fail('conflict');
      }
      const started = this.now();
      const startedAt = new Date(started).toISOString();
      const record = {
        id: options.id,
        version: 1,
        options,
        revision: globalThis.crypto.randomUUID(),
        signature: JSON.stringify(options),
        phase: options.review.testMode ? 'completed' : 'starting',
        active: !options.review.testMode,
        cursor: 0,
        delivered: [],
        skipped: [],
        currentUrl: null,
        code: null,
        nextAt: null,
        ...(batchSalaryFloor(options.review) === null
          ? {}
          : {
              salaryTier: 0,
              salaryFloorRub: batchSalaryFloor(options.review),
              salaryDeferred: 0,
            }),
        startedAt,
        expiresAt: new Date(started + options.durationMs).toISOString(),
        ...(options.processChats
          ? { chatPassId: `question-unread:${globalThis.crypto.randomUUID()}` }
          : {}),
      };
      readApplicationBatch(record, options);
      await saveAcknowledgedRecord(this.service.store, record);
      await saveAcknowledgedRecord(this.service.store, {
        id: latest(options.browserSlot),
        requestId: options.requestId,
      });
      signal.throwIfAborted();
      if (options.review.testMode) {
        return;
      }
      this.service.skipContext = Object.freeze({
        ...this.service.skipContext,
        runId: globalThis.crypto.randomUUID(),
      });
      this.service.modes.signal(
        null,
        options.browserSlot,
        options.noQuestionnaires
      );
      const runtime = {
        record,
        controller: new AbortController(),
        salaryPending: new Map(),
      };
      runtime.timer = globalThis.setTimeout(() => {
        runtime.expired = true;
        runtime.controller.abort();
      }, options.durationMs);
      runtime.timer.unref?.();
      this.runtime = runtime;
      owners.set(this.service.store, this);
      runtime.work = this.cycle(runtime).finally(() => {
        globalThis.clearTimeout(runtime.timer);
        this.salary.clear(runtime);
        if (this.runtime === runtime) {
          this.runtime = null;
        }
        if (owners.get(this.service.store) === this) {
          owners.delete(this.service.store);
        }
      });
      runtime.work.catch(() => {});
    });
    return this.status(options);
  }
  async stop(input) {
    const key = applicationBatchKey(input);
    if (this.runtime && this.runtime.record.id !== key.id) {
      throw fail('missing');
    }
    await this.drain();
    return this.status(input);
  }
  async skipChat(input) {
    const key = applicationBatchKey(input);
    const target = input.chatReview ?? {};
    const runtime = this.runtime;
    if (
      runtime?.record.id === key.id &&
      runtime.record.active &&
      runtime.record.options.chatWatchWaiting &&
      !runtime.controller.signal.aborted &&
      runtime.chats
    ) {
      await runtime.chats.skip(target);
    }
    const receipt = await this.status(key);
    const worker = receipt.batch?.chatWorker;
    if (
      worker?.passId !== target.id ||
      !sameUnreadSkip(worker?.lastSkip, target)
    ) {
      throw fail('chats-skip-changed');
    }
    return receipt;
  }
  async mode(input) {
    const key = applicationBatchKey(input);
    await this.service.operate(async (signal) => {
      const runtime = this.runtime;
      if (
        !runtime ||
        runtime.record.id !== key.id ||
        input.revision !== runtime.record.revision
      ) {
        throw fail('changed');
      }
      const modes = this.service.modes.change(key.browserSlot, input);
      const current = this.service.current;
      if (current) {
        await this.service.actions.mode(current, input, signal);
      } else {
        this.service.modes.save(key.browserSlot, modes);
      }
      await this.save(runtime, { revision: globalThis.crypto.randomUUID() });
    });
    return this.status(input);
  }
  async drain() {
    const runtime = this.runtime;
    runtime?.controller.abort();
    await runtime?.work;
  }
  async cycle(runtime) {
    try {
      // Yield until the start acknowledgement releases its writer.
      await this.wait(0, runtime.controller.signal);
      if (runtime.record.options.processChats) {
        runtime.chats = this.service.createChats();
        await runtime.chats.start(runtime.record, {
          applicationPage: () => this.chatApplicationPage(runtime),
        });
      }
      while (!applicationBatchTerminal(runtime.record.phase)) {
        try {
          await this.service.operate((writer) =>
            this.tick(
              runtime,
              globalThis.AbortSignal.any([writer, runtime.controller.signal])
            )
          );
        } catch (error) {
          if (!this.interrupted(runtime, error)) {
            throw error;
          }
        }
        if (runtime.waitRequested) {
          await this.startLimitWait(runtime);
        }
        if (!applicationBatchTerminal(runtime.record.phase)) {
          await this.wait(1000, runtime.controller.signal);
        }
      }
    } catch (error) {
      // Even an unacknowledged final snapshot cannot become recovery permission.
      const record = {
        ...runtime.record,
        active: false,
        revision: globalThis.crypto.randomUUID(),
        phase: runtime.expired
          ? 'expired'
          : runtime.controller.signal.aborted
            ? 'stopped'
            : 'refused',
        code: runtime.controller.signal.aborted
          ? null
          : (error.code ?? 'jobs-application-unavailable'),
      };
      try {
        await saveAcknowledgedRecord(this.service.store, record);
        runtime.record = record;
      } catch (saveError) {
        this.service.trace({
          event: 'application-batch-final-save-refused',
          code: saveError.code ?? 'unknown',
        });
      }
      this.service.trace({
        event: 'application-batch-ended',
        phase: record.phase,
        code: record.code,
      });
    } finally {
      try {
        await this.drainLimitWait(runtime);
      } finally {
        await this.finishChats(runtime);
      }
    }
  }
  async finishChats(runtime) {
    if (!runtime.chats) {
      return;
    }
    let code;
    try {
      await runtime.chats.close();
    } catch (error) {
      code = error.code ?? 'jobs-application-chats-stop';
      this.service.trace({ event: 'application-chats-drain-refused', code });
    }
    const chatWorker = {
      ...runtime.chats.status(),
      active: false,
      pid: null,
      ...(code ? { phase: 'refused', code } : {}),
    };
    const record = { ...runtime.record, chatWorker };
    await saveAcknowledgedRecord(this.service.store, record);
    runtime.record = record;
  }
  async drainLimitWait(runtime) {
    if (
      runtime.limitWaitId &&
      this.service.current?.limitWait?.id === runtime.limitWaitId
    ) {
      await this.service.limitWait.drain();
    }
  }
  interrupted(runtime, error) {
    if (error.code === 'jobs-busy') {
      return true;
    }
    if (error.code !== 'jobs-application-state') {
      return false;
    }
    const modes = this.service.modes.read(runtime.record.options.browserSlot);
    return (
      modes.paused ||
      (modes.noQuestionnaires &&
        this.queue(runtime).some(
          (row) => row.url === runtime.record.currentUrl
        ))
    );
  }
  async startLimitWait(runtime) {
    const input = runtime.waitRequested;
    runtime.waitRequested = null;
    runtime.controller.signal.throwIfAborted();
    await this.service.limitWait.start(input);
  }
  queue(runtime) {
    const options = runtime.record.options;
    return [...this.service.deferrals.entries.values()].filter(
      (row) =>
        row.requestId === options.requestId &&
        row.browserSlot === options.browserSlot &&
        options.urls.includes(row.url)
    );
  }
  async finishApplications(runtime) {
    const review = await runtime.chats?.reviewPending();
    return this.save(runtime, {
      phase: review ? 'chat-review' : 'completed',
      active: Boolean(review),
      currentUrl: null,
      nextAt: null,
    });
  }
  async tick(runtime, signal) {
    signal.throwIfAborted();
    const record = runtime.record;
    const modes = this.service.modes.read(record.options.browserSlot);
    if (this.now() >= Date.parse(record.expiresAt)) {
      return this.save(runtime, { phase: 'expired', active: false });
    }
    if (modes.paused) {
      return this.save(runtime, { phase: 'paused' });
    }
    if (this.service.current) {
      return this.observe(runtime, signal);
    }
    const maximum = record.options.maxApplications;
    if (maximum && record.delivered.length >= maximum) {
      return this.finishApplications(runtime);
    }
    const limit = await this.service.limits.read();
    if (limit?.active) {
      return this.save(runtime, { phase: 'daily-limit', nextAt: limit.until });
    }
    return this.admit(runtime, signal, modes);
  }
  async admit(runtime, signal, modes) {
    const record = runtime.record;
    const queue = this.queue(runtime);
    const due = queue.find((row) =>
      row.reason === 'questionnaire'
        ? !modes.noQuestionnaires
        : this.service.retries.ready(row)
    );
    const salaryUrl =
      !due && record.cursor === record.options.urls.length
        ? this.salary.due(runtime)
        : null;
    const url = due?.url ?? record.options.urls[record.cursor] ?? salaryUrl;
    if (!url) {
      if (await this.salary.advance(runtime)) {
        return;
      }
      if (!queue.length) {
        return this.finishApplications(runtime);
      }
      const retryAt =
        queue
          .filter((row) => row.retryAt)
          .map((row) => row.retryAt)
          .sort()[0] ?? null;
      return this.save(runtime, {
        phase: retryAt ? 'retry-wait' : 'questionnaires-held',
        currentUrl: null,
        nextAt: retryAt,
      });
    }
    const choices = await storedVacancyChoices(
      this.service.store,
      record.options
    );
    const skips = await storedVacancySkips(this.service.store, record.options);
    const pending = await pendingDeferredVacancies(
      this.service.store,
      record.options.review
    );
    signal.throwIfAborted();
    if (
      excludedVacancy(url, pending, choices, skips, this.service.skipContext)
    ) {
      await this.salary.remove(runtime, url);
      return this.exclude(runtime, url, due, Boolean(salaryUrl));
    }
    const pace = await this.service.pacing.read();
    if (pace?.waiting) {
      return this.save(runtime, { phase: 'pacing', nextAt: pace.nextAt });
    }
    return this.open(runtime, url, due, signal, Boolean(salaryUrl));
  }
  async open(runtime, url, due, signal, salaryRetry = false) {
    const record = runtime.record;
    await this.save(runtime, {
      currentUrl: url,
      phase: 'review',
      nextAt: null,
      cursor: due || salaryRetry ? record.cursor : record.cursor + 1,
    });
    signal.throwIfAborted();
    if (due) {
      await this.service.deferrals.retry(
        { ...due, confirm: true, queueId: due.id },
        signal
      );
      if (this.service.current?.state === 'review') {
        await this.restore(this.service.current, signal);
      }
    } else {
      await this.service.open(
        {
          ...record.options.review,
          url,
          ...(salaryRetry ? { recover: true } : {}),
        },
        signal
      );
    }
    await this.service.questionDeferrals.automatic(signal);
    const current = this.service.current;
    if (current && (await this.salary.preserve(runtime, current, signal))) {
      return;
    }
    if (salaryRetry) {
      await this.salary.remove(runtime, url);
      await this.restoreSalary(current, signal);
    }
    if (
      current &&
      ['ready', 'review'].includes(current.state) &&
      !current.hold
    ) {
      await this.service.continuation.run(current, {}, signal);
    }
  }
  async restoreSalary(current, signal) {
    if (current?.draft && current.state === 'review') {
      await this.restore(current, signal);
    }
  }
  async exclude(runtime, url, entry, salaryRetry = false) {
    if (entry) {
      this.service.deferrals.entries.delete(applicationKey(entry).id);
      this.service.deferrals.revision = globalThis.crypto.randomUUID();
    }
    return this.save(runtime, {
      skipped: [...new Set([...runtime.record.skipped, url])],
      cursor:
        entry || salaryRetry
          ? runtime.record.cursor
          : runtime.record.cursor + 1,
    });
  }
  async questionDeferred(record) {
    const runtime = this.runtime;
    if (
      runtime?.record.active &&
      runtime.record.currentUrl === record.url &&
      runtime.record.options.requestId === record.requestId &&
      runtime.record.options.browserSlot === record.browserSlot
    ) {
      await this.save(runtime, {
        skipped: [...new Set([...runtime.record.skipped, record.url])],
      });
    }
  }
  async restore(current, signal) {
    if (
      current.draft?.fields.length > current.page.fieldIndices.length &&
      current.page.letterToggle
    ) {
      await this.service.actions.showLetter(current, signal);
    }
    await this.service.drafts.restore(current, { confirm: true }, signal);
    if (current.restoration?.state !== 'restored') {
      throw fail('changed');
    }
  }
  chatApplicationPage(runtime) {
    const current = this.service.current;
    if (
      this.runtime === runtime &&
      !runtime.controller.signal.aborted &&
      !applicationBatchTerminal(runtime.record.phase) &&
      current?.active &&
      !current.closing &&
      current.url === runtime.record.currentUrl &&
      current.requestId === runtime.record.options.requestId &&
      current.browserSlot === runtime.record.options.browserSlot
    ) {
      return current.browser?.page;
    }
    return null;
  }
  async recordDelivery(runtime, current) {
    const { url } = current;
    const delivered = runtime.record.delivered.includes(url);
    const attachments = runtime.record.letterAttachments ?? [];
    const status = applicationAttachmentStatus(current);
    const state = ['provider-confirmed', 'unknown'].includes(status)
      ? status
      : status
        ? 'needs-review'
        : null;
    const previous = attachments.find((row) => row.url === url);
    if (delivered && (!state || previous?.state === state)) {
      return;
    }
    await this.save(runtime, {
      ...(!delivered && { delivered: [...runtime.record.delivered, url] }),
      ...(state && previous?.state !== state
        ? {
            letterAttachments: previous
              ? attachments.map((row) =>
                  row === previous ? { url, state } : row
                )
              : [...attachments, { url, state }],
          }
        : {}),
    });
    if (!delivered) {
      runtime.chats?.applicationDelivered();
    }
  }
  async closeReview(current) {
    const runtime = this.runtime;
    if (
      runtime?.record.active &&
      !runtime.controller.signal.aborted &&
      current.delivery === 'provider-confirmed' &&
      current.url === runtime.record.currentUrl &&
      current.requestId === runtime.record.options.requestId &&
      current.browserSlot === runtime.record.options.browserSlot
    ) {
      await this.recordDelivery(runtime, current);
    }
    return this.service.close();
  }
  async finishDelivery(runtime, current, signal) {
    await this.recordDelivery(runtime, current);
    const status = applicationAttachmentStatus(current);
    if (!status || status === 'provider-confirmed') {
      return this.service.close();
    }
    await this.save(runtime, { phase: 'review', nextAt: null });
    const action = attachmentActions[status];
    if (
      !action ||
      current.options.testMode ||
      applicationConfirmationPolicy(current.options).includes(action[1])
    ) {
      return;
    }
    try {
      await this.service.attachment.advance(
        current,
        { action: action[0], confirm: true },
        signal
      );
    } catch (error) {
      if (signal.aborted || current.attachmentDelivery !== 'unknown') {
        throw error;
      }
      this.service.trace({
        event: 'application-batch-letter-uncertain',
        code: error.code ?? 'unknown',
      });
    }
    await this.recordDelivery(runtime, current);
  }
  async observe(runtime, signal) {
    const current = this.service.current;
    if (
      current.url !== runtime.record.currentUrl ||
      current.requestId !== runtime.record.options.requestId ||
      current.browserSlot !== runtime.record.options.browserSlot
    ) {
      throw fail('busy');
    }
    if (await this.observeLimitWait(runtime, current, signal)) {
      return;
    }
    const page = await this.service.attachment.readPage(current);
    signal.throwIfAborted();
    if (
      current.delivery === 'provider-confirmed'
        ? applicationPageKey(page) !== current.guard?.page
        : observedOutcome(page)
    ) {
      await this.service.review.inspect(current, signal);
    }
    if (await this.salary.preserve(runtime, current, signal)) {
      return;
    }
    if (current.delivery === 'provider-confirmed') {
      return this.finishDelivery(runtime, current, signal);
    }
    if (current.delivery === 'unknown' && !current.hold) {
      throw fail('unconfirmed');
    }
    this.prepareLimitWait(runtime, current);
    return this.save(runtime, {
      phase: current.state === 'daily-limit' ? 'daily-limit' : 'review',
      nextAt:
        current.state === 'daily-limit'
          ? (current.applicationLimit?.until ?? null)
          : null,
    });
  }
  async observeLimitWait(runtime, current, signal) {
    if (!runtime.limitWaitId || current.limitWait?.id !== runtime.limitWaitId) {
      return false;
    }
    const phase = current.limitWait.phase;
    if (phase === 'review' && current.restoration?.state === 'restored') {
      await this.resumeLimitWait(current, signal);
      runtime.previousWaitId = current.limitWait.id;
      runtime.limitWaitId = null;
      return false;
    }
    if (['stopped', 'refused'].includes(phase)) {
      throw fail('wait-refused');
    }
    await this.save(runtime, {
      phase: 'daily-limit',
      nextAt: current.limitWait.until,
    });
    return true;
  }
  async resumeLimitWait(current, signal) {
    if (
      current.state !== 'review' ||
      current.attempted.submit ||
      current.delivery !== 'none' ||
      (current.hold && current.hold !== 'daily-limit')
    ) {
      throw fail('wait-refused');
    }
    const policy = applicationPreservationPolicy(this.service, current, signal);
    await this.service.review.check(current, 'submit', signal, true);
    policy();
    // Only this explicitly started batch's verified wait and protected restore
    // authorize clearing its original daily-limit hold. Other holds remain manual.
    this.service.holds.entries.delete(current.id);
    current.hold = null;
    this.service.trace({ event: 'application-batch-limit-resumed' });
    await this.service.continuation.run(current, {}, signal);
  }
  prepareLimitWait(runtime, current) {
    if (
      current.state !== 'daily-limit' ||
      (current.limitWait && current.limitWait.id !== runtime.previousWaitId) ||
      !current.applicationLimit?.active ||
      !current.applicationLimit.saved ||
      !current.draft?.limit ||
      current.paused ||
      current.noQuestionnaires
    ) {
      return;
    }
    runtime.limitWaitId = globalThis.crypto.randomUUID();
    runtime.waitRequested = {
      ...applicationKey(current),
      requestId: current.requestId,
      revision: current.revision,
      waitId: runtime.limitWaitId,
      confirm: true,
      restoreDraft: true,
    };
  }
}
