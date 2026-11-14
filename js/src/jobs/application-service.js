import path from 'node:path';
import { openBrowserSession } from '../cv/browser.js';
import { createReviewedPrefill } from '../forms/review-prefill.js';
import { acknowledgedRead, acknowledgedWrite } from './acknowledged-store.js';
import {
  applicationKey,
  applicationSettings,
  applicationFailure as fail,
  applicationView,
} from './application-options.js';
import {
  applicationTarget,
  readApplicationPage,
  writeApplicationLetter,
  dispatchApplication,
} from './application-page.js';
import {
  readApplicationJournal,
  saveApplicationJournal,
} from './application-journal.js';
import { ApplicationReview } from './application-review.js';
import { ApplicationActions } from './application-actions.js';

const owners = new WeakMap();
export const applicationOwned = (store) => owners.has(store);

/** One owned browser; journals reserve dispatch before any provider effect. */
class ApplicationService {
  constructor({
    store,
    storeDir,
    run,
    openSession = openBrowserSession,
    filling = createReviewedPrefill({ store }),
    idleMs = 15 * 60 * 1000,
    readPage = readApplicationPage,
    target = applicationTarget,
    writeLetter = writeApplicationLetter,
    dispatch = dispatchApplication,
    trace = process.env.MS_JOBS_APPLICATION_DEBUG === '1'
      ? (value) => console.error(value)
      : () => {},
  }) {
    Object.assign(this, {
      store,
      storeDir,
      run,
      openSession,
      filling,
      idleMs,
      readPage,
      target,
      writeLetter,
      dispatch,
      trace,
    });
    this.review = new ApplicationReview(this);
    this.actions = new ApplicationActions(this);
  }
  save(record) {
    return saveApplicationJournal(this.store, record);
  }
  async close() {
    globalThis.clearTimeout(this.timer);
    const record = this.current;
    if (!record) {
      return;
    }
    try {
      await this.filling.clear(record);
    } finally {
      await record.browser?.close();
    }
    this.current = null;
    if (owners.get(this.store) === this) {
      owners.delete(this.store);
    }
    return { ...applicationView(record), state: 'closed' };
  }
  touch() {
    globalThis.clearTimeout(this.timer);
    if (!this.current || this.stopped) {
      return;
    }
    this.timer = globalThis.setTimeout(() => {
      this.operate(() => this.close()).catch((error) =>
        this.trace({
          event: 'application-idle-close-refused',
          code: error.code ?? 'unknown',
        })
      );
    }, this.idleMs);
    this.timer.unref?.();
  }
  operate(operation) {
    if (this.stopped) {
      return Promise.reject(fail('stopped'));
    }
    const next = acknowledgedWrite(this.store, this.run, async (signal) => {
      globalThis.clearTimeout(this.timer);
      try {
        return await operation(signal);
      } finally {
        this.touch();
      }
    });
    this.task = next;
    next
      .finally(() => {
        if (this.task === next) {
          this.task = null;
        }
      })
      .catch(() => {});
    return next;
  }
  owned(input) {
    const key = applicationKey(input);
    const record = this.current;
    if (
      !record ||
      record.id !== key.id ||
      input.requestId !== record.requestId
    ) {
      throw fail('missing');
    }
    if (input.revision !== record.revision) {
      throw fail('changed');
    }
    return record;
  }
  status(input) {
    const key = applicationKey(input);
    return acknowledgedRead(this.store, async () => {
      const saved =
        this.current?.id === key.id
          ? this.current
          : await this.store.get(key.id);
      if (!saved) {
        return {
          ok: true,
          mode: 'hh-application-missing',
          url: key.url,
          browserSlot: key.browserSlot,
          requestId: input.requestId ?? null,
        };
      }
      const row =
        saved === this.current ? saved : readApplicationJournal(saved, key);
      if (input.requestId !== undefined && input.requestId !== row.requestId) {
        throw fail('conflict');
      }
      return applicationView(
        this.current === row
          ? row
          : {
              ...row,
              state:
                row.delivery === 'provider-confirmed'
                  ? 'delivered'
                  : 'interrupted',
            }
      );
    });
  }
  async restore(options, input) {
    const saved = await this.store.get(options.id);
    if (!saved) {
      return { options };
    }
    const previous = readApplicationJournal(saved, options);
    if (previous.requestId !== options.requestId) {
      // A never-dispatched request may be replaced. Unknown/provider-confirmed
      // intent remains reserved for this vacancy even under a fresh request ID.
      if (
        previous.attempted.enter ||
        previous.attempted.submit ||
        previous.delivery !== 'none'
      ) {
        throw fail('conflict');
      }
      return { options };
    }
    if (input.recover === true) {
      options = applicationSettings(previous.options);
    }
    if (previous.signature !== JSON.stringify(options)) {
      throw fail('conflict');
    }
    return { options, previous };
  }
  async open(input, signal) {
    let options = applicationSettings(input);
    if (this.current) {
      const record = this.current;
      const same =
        record.id === options.id && record.requestId === options.requestId;
      if (!same) {
        throw fail('busy');
      }
      if (!input.recover && JSON.stringify(options) !== record.signature) {
        throw fail('conflict');
      }
      return applicationView(record);
    }
    if (owners.has(this.store)) {
      throw fail('busy');
    }
    const restored = await this.restore(options, input);
    options = restored.options;
    if (restored.previous && !input.recover) {
      return applicationView({
        ...restored.previous,
        state:
          restored.previous.delivery === 'provider-confirmed'
            ? 'delivered'
            : 'interrupted',
      });
    }
    const record = {
      ...options,
      options,
      signature: JSON.stringify(options),
      state: 'opening',
      delivery: 'none',
      attempted: { enter: false, submit: false },
      ...restored.previous,
      id: options.id,
      noQuestionnaires: false,
      paused: false,
      browser: null,
    };
    record.acknowledged = restored.previous;
    this.current = record;
    owners.set(this.store, this);
    try {
      await this.save(record);
      signal.throwIfAborted();
      record.browser = await this.openSession({
        store: this.store,
        platform: 'hh',
        useCase: 'jobs',
        slot: options.browserSlot,
        headless: options.headless,
        profileDir: path.join(
          this.storeDir,
          'browser-profiles',
          'hh',
          options.browserSlot
        ),
      });
      signal.throwIfAborted();
      await record.browser.commander.goto({
        url: options.url,
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      signal.throwIfAborted();
      return await this.review.inspect(record, signal);
    } catch (error) {
      // Always drain this browser, including failed journal writes.
      record.state = 'interrupted';
      record.code = error.code ?? 'jobs-application-unavailable';
      try {
        await this.save(record);
      } finally {
        await this.close();
      }
      throw error;
    }
  }
  async stop() {
    this.stopped = true;
    globalThis.clearTimeout(this.timer);
    await this.task?.catch(() => {});
    await this.close();
  }
}
export const createApplicationService = (options) => {
  const service = new ApplicationService(options);
  return {
    operations: {
      'application-open': (input) =>
        service.operate((signal) => service.open(input, signal)),
      'application-status': (input) => service.status(input),
      'application-read': (input) =>
        service.operate((signal) =>
          service.review.inspect(service.owned(input), signal)
        ),
      'application-advance': (input) =>
        service.operate((signal) =>
          service.actions.advance(service.owned(input), input, signal)
        ),
      'application-prefill': (input) =>
        service.operate((signal) =>
          service.actions.prefill(service.owned(input), input, signal)
        ),
      'application-mode': (input) =>
        service.operate((signal) =>
          service.actions.mode(service.owned(input), input, signal)
        ),
      'application-close': (input) =>
        service.operate(() => {
          service.owned(input);
          return service.close();
        }),
    },
    cancel: () => service.close(),
    stop: () => service.stop(),
  };
};
