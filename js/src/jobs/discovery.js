import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { acknowledgedRead, acknowledgedWrite } from './acknowledged-store.js';
import { hhSearchUrl, jobsBrowserOptions, jobsFailure } from './options.js';
import { vacancySnapshot } from '../assignments/vacancy.js';
import { storedVacancyChoices } from './vacancy-choice-service.js';
import { vacancySelectionDecision } from './vacancy-selection.js';
import {
  discoveryKey,
  discoveryOptions,
  discoveryRecord,
  discoveryView,
} from './discovery-data.js';
import { confirmedVacancySearch } from './search-result.js';
import {
  freshSalaryLadder,
  salaryLadderStart,
  salaryTierSearch,
  salaryTierFloor,
  assessVacancySalary,
} from './salary-ladder.js';

const latest = (slot) => `secret:jobs-discovery-latest:${slot}`;
const immediate = (work) => work();
const safeCode = (error) =>
  typeof error.code === 'string' && /^[a-z\d-]{1,120}$/u.test(error.code)
    ? error.code
    : 'jobs-discovery-unavailable';
const defaultTrace =
  process.env.MS_JOBS_DISCOVERY_DEBUG === '1'
    ? (value) => console.error(value)
    : () => {};

const pageProgress = (record, options, result) => {
  const pages = record.pages + 1;
  const limit = record.entries.length === options.maxVacancies;
  const advance =
    !limit &&
    pages < options.maxPages &&
    result.nextPage === null &&
    salaryTierFloor(options, record.salaryTier) > 0;
  const reason = limit
    ? 'vacancy-limit'
    : result.nextPage === null &&
        !advance &&
        !(
          pages === options.maxPages &&
          salaryTierFloor(options, record.salaryTier) > 0
        )
      ? 'exhausted'
      : pages === options.maxPages
        ? 'page-limit'
        : null;
  return { pages, limit, advance, reason };
};

/** One finite owned read lane; only acknowledged checkpoints become public progress. */
class VacancyDiscovery {
  constructor({
    store,
    run,
    readSearch,
    readVacancy,
    retryWaiting = () => false,
    now = Date.now,
    trace = defaultTrace,
  }) {
    Object.assign(this, {
      store,
      run,
      readSearch,
      readVacancy,
      retryWaiting,
      now,
      trace,
    });
    this.tail = Promise.resolve();
  }
  enqueue(operation) {
    const task = this.tail.then(operation);
    this.tail = task.catch(() => {});
    return task;
  }
  async status(input = {}) {
    const { browserSlot } = jobsBrowserOptions(input);
    const requestId =
      input.requestId ??
      (this.current?.key.browserSlot === browserSlot
        ? this.current.key.requestId
        : undefined) ??
      (
        await acknowledgedRead(this.store, () =>
          this.store.get(latest(browserSlot))
        )
      )?.requestId;
    if (!requestId) {
      return discoveryView(null, false);
    }
    const key = discoveryKey({ browserSlot, requestId });
    const raw =
      this.current?.key.id === key.id
        ? this.current.record
        : await acknowledgedRead(this.store, () => this.store.get(key.id));
    return discoveryView(
      raw ? discoveryRecord(raw, key) : null,
      this.current?.key.id === key.id
    );
  }
  async save(owned, record) {
    discoveryRecord(record, owned.key);
    await acknowledgedWrite(this.store, immediate, () =>
      saveAcknowledgedRecord(this.store, record)
    );
    owned.record = record;
  }
  check(owned, signal) {
    if (this.now() >= Date.parse(owned.record.expiresAt)) {
      owned.expired = true;
      owned.controller.abort();
    }
    signal.throwIfAborted();
  }
  async entry(owned, card, signal) {
    const options = owned.record.options;
    let choices = await storedVacancyChoices(this.store, options);
    let decision = vacancySelectionDecision(card, choices, [], options.filters);
    let capturedAt = null;
    const pay = salaryLadderStart(options)
      ? {
          tier: owned.record.salaryTier,
          ...assessVacancySalary(
            card.salary,
            options.salaryConfig,
            salaryTierFloor(options, owned.record.salaryTier)
          ),
        }
      : null;
    const waiting = () =>
      this.retryWaiting({ url: card.url, browserSlot: options.browserSlot });
    if (
      ['review', 'needs-description'].includes(decision.reason) &&
      (!pay || pay.action === 'apply') &&
      !waiting()
    ) {
      const snapshot = await acknowledgedWrite(this.store, immediate, () =>
        vacancySnapshot(
          this.store,
          this.readVacancy,
          card.url,
          options.refresh,
          signal,
          options
        )
      );
      this.check(owned, signal);
      capturedAt = snapshot.capturedAt;
      choices = await storedVacancyChoices(this.store, options);
      decision = vacancySelectionDecision(
        card,
        choices,
        [snapshot],
        options.filters
      );
    }
    if (
      ['review', 'needs-description'].includes(decision.reason) &&
      waiting()
    ) {
      decision = { ...decision, reason: 'retry-wait' };
    }
    return {
      card,
      decision,
      choiceRevision: choices.revision,
      capturedAt,
      ...(pay ? { pay } : {}),
    };
  }
  async cards(owned, cards, signal) {
    for (const card of cards) {
      this.check(owned, signal);
      const previous = owned.record.entries.findIndex(
        (row) => row.card.url === card.url
      );
      const entries = [...owned.record.entries];
      if (previous >= 0) {
        // A later positive responded marker dominates an earlier unresponded card.
        if (card.responded && !entries[previous].card.responded) {
          entries[previous] = await this.entry(owned, card, signal);
        }
        this.check(owned, signal);
        await this.save(owned, {
          ...owned.record,
          entries,
          duplicates: owned.record.duplicates + 1,
        });
        continue;
      }
      entries.push(await this.entry(owned, card, signal));
      this.check(owned, signal);
      await this.save(owned, { ...owned.record, entries });
      if (entries.length === owned.record.options.maxVacancies) {
        return;
      }
    }
  }
  async scan(owned, signal) {
    while (owned.record.phase === 'running') {
      this.check(owned, signal);
      const record = owned.record;
      const options = record.options;
      const search = {
        ...salaryTierSearch(options, record.salaryTier),
        page: record.nextPage,
      };
      this.trace({
        event: 'vacancy-discovery-page',
        page: record.nextPage,
        entries: record.entries.length,
      });
      const result = confirmedVacancySearch(
        await this.readSearch(hhSearchUrl(search), { ...options, signal }),
        search
      );
      this.check(owned, signal);
      await this.cards(owned, result.cards, signal);
      this.check(owned, signal);
      const { pages, limit, advance, reason } = pageProgress(
        owned.record,
        options,
        result
      );
      await this.save(owned, {
        ...owned.record,
        pages,
        nextPage: limit ? record.nextPage : advance ? 0 : result.nextPage,
        ...(advance ? { salaryTier: record.salaryTier + 1 } : {}),
        reason,
        phase: reason ? 'completed' : 'running',
      });
      if (advance) {
        for (let index = 0; index < owned.record.entries.length; index += 1) {
          const row = owned.record.entries[index];
          if (row.pay?.action !== 'defer') {
            continue;
          }
          this.check(owned, signal);
          const entries = [...owned.record.entries];
          entries[index] = await this.entry(owned, row.card, signal);
          this.check(owned, signal);
          await this.save(owned, { ...owned.record, entries });
        }
      }
    }
  }
  async cycle(owned, writer, accept) {
    const { options } = owned;
    const signal = globalThis.AbortSignal.any([
      writer,
      owned.controller.signal,
    ]);
    const began = this.now();
    const ladder = freshSalaryLadder(options, began);
    await this.save(owned, {
      id: options.id,
      version: 1,
      options,
      signature: JSON.stringify(options),
      phase: 'running',
      reason: null,
      pages: 0,
      nextPage: ladder ? ladder.search.page : options.search.page,
      ...(ladder ? { salaryTier: 0 } : {}),
      entries: [],
      duplicates: 0,
      startedAt: new Date(began).toISOString(),
      expiresAt: new Date(began + options.durationMs).toISOString(),
      code: null,
    });
    await acknowledgedWrite(this.store, immediate, () =>
      saveAcknowledgedRecord(this.store, {
        id: latest(options.browserSlot),
        requestId: options.requestId,
      })
    );
    signal.throwIfAborted();
    accept(discoveryView(owned.record, true));
    const timer = globalThis.setTimeout(
      () => {
        owned.expired = true;
        owned.controller.abort();
      },
      Math.max(0, Date.parse(owned.record.expiresAt) - this.now())
    );
    timer.unref?.();
    try {
      await this.scan(owned, signal);
    } catch (error) {
      await this.finish(owned, signal, error);
    } finally {
      globalThis.clearTimeout(timer);
      this.trace({
        event: 'vacancy-discovery-ended',
        phase: owned.record.phase,
        pages: owned.record.pages,
        entries: owned.record.entries.length,
      });
    }
  }
  async finish(owned, signal, error) {
    try {
      await this.save(owned, {
        ...owned.record,
        phase: owned.expired
          ? 'expired'
          : signal.aborted
            ? 'stopped'
            : 'failed',
        code: safeCode(error),
      });
    } catch (saveError) {
      this.trace({
        event: 'vacancy-discovery-final-save-refused',
        code: safeCode(saveError),
      });
      // The earlier acknowledged running record is rendered as interrupted after drain.
    }
  }
  async start(input) {
    const options = discoveryOptions(input);
    if (input.confirm !== true) {
      throw jobsFailure(
        'discovery-confirmation',
        'Confirm finite browser discovery.'
      );
    }
    const previous = await acknowledgedRead(this.store, () =>
      this.store.get(options.id)
    );
    if (previous) {
      const record = discoveryRecord(previous, options);
      if (record.signature !== JSON.stringify(options)) {
        throw jobsFailure(
          'discovery-conflict',
          'This discovery ID belongs to different settings.'
        );
      }
      return this.status(options);
    }
    if (this.current) {
      throw jobsFailure('busy', 'Another discovery is still owned.');
    }
    const admission = Promise.withResolvers();
    const owned = {
      key: options,
      options,
      record: null,
      controller: new AbortController(),
    };
    this.current = owned;
    owned.work = this.run((writer) =>
      this.cycle(owned, writer, admission.resolve)
    );
    owned.work.catch(admission.reject).finally(() => {
      if (this.current === owned) {
        this.current = null;
      }
    });
    return admission.promise;
  }
  async stop(input) {
    const key = discoveryKey(input);
    if (this.current?.key.id === key.id) {
      this.current.controller.abort();
      await this.current.work.catch(() => {});
    }
    return this.status(input);
  }
}
export const createVacancyDiscovery = (options) => {
  const service = new VacancyDiscovery(options);
  return {
    'discovery-start': (input) => service.enqueue(() => service.start(input)),
    'discovery-status': (input) => service.status(input),
    'discovery-stop': (input) => service.enqueue(() => service.stop(input)),
    'discovery-drain': async () => {
      await service.current?.work;
    },
  };
};
