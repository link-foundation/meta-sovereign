import { resolveBrowserPolicy } from '../browser/policy.js';
import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { jobsFailure } from './options.js';
import { bindAttentionPage } from '../automation/attention-foreground.js';
import {
  loginIdentity,
  loginKey,
  loginLatestKey,
  loginOptions,
  loginResult,
} from './login-record.js';

const owners = new WeakMap();
export const jobLoginOwned = (store) => owners.has(store);
const traceLogin = (state) => {
  if (process.env.MS_JOBS_BROWSER_DEBUG === '1') {
    console.error({ event: 'jobs-manual-login', state });
  }
};

/** A held visible profile, with no credential/DOM reads or automated input. */
class JobLogin {
  constructor({
    store,
    openSession,
    run,
    now = Date.now,
    setTimer = globalThis.setTimeout,
    clearTimer = globalThis.clearTimeout,
    trace = traceLogin,
  }) {
    Object.assign(this, {
      store,
      openSession,
      run,
      now,
      setTimer,
      clearTimer,
      trace,
    });
  }
  async status(input = {}) {
    const identity = loginIdentity(input);
    identity.requestId ??= (
      await this.store.get(loginLatestKey(identity.browserSlot))
    )?.requestId;
    if (!identity.requestId) {
      return { login: null };
    }
    const owner = owners.get(this.store);
    const current = owner?.current;
    const raw = await this.store.get(loginKey(identity.requestId));
    const result = loginResult(raw, identity);
    if (
      result.login?.active &&
      current?.record.requestId !== identity.requestId
    ) {
      return {
        login: {
          ...result.login,
          active: false,
          state: 'interrupted',
          code: 'jobs-login-interrupted',
        },
      };
    }
    return result;
  }
  currentNotice() {
    const current = this.current;
    if (
      !current?.notice ||
      current.record.state !== 'browser-open' ||
      this.stopped ||
      this.closing ||
      this.finishing ||
      current.browserClosed ||
      current.browser.page.isClosed?.() ||
      Date.parse(current.notice.expiresAt) <= this.now()
    ) {
      return null;
    }
    const { page } = current.browser;
    return bindAttentionPage(
      {
        ...current.notice,
        focusAvailable: typeof page.bringToFront === 'function',
      },
      page
    );
  }
  attention() {
    const notice = owners.get(this.store)?.currentNotice();
    return { ok: true, attention: notice ? [notice] : [] };
  }
  async focus({ id, requestId, browserSlot } = {}) {
    const owner = owners.get(this.store);
    const notice = owner?.currentNotice();
    if (
      !notice ||
      notice.id !== id ||
      notice.requestId !== requestId ||
      notice.browserSlot !== browserSlot
    ) {
      throw jobsFailure(
        'attention-ended',
        'That HeadHunter login window has ended.'
      );
    }
    if (!notice.focusAvailable) {
      throw jobsFailure(
        'attention-focus-unavailable',
        'This browser cannot be focused.'
      );
    }
    await owner.current.browser.page.bringToFront();
    return { ok: true };
  }
  async save(change) {
    const current = this.current;
    const next = { ...current.record, ...change };
    loginResult(next);
    await saveAcknowledgedRecord(this.store, next);
    current.record = next;
    this.trace(next.state);
  }
  start(input) {
    if (this.stopped) {
      return Promise.reject(
        jobsFailure('stopped', 'Login control has stopped.')
      );
    }
    if (this.task) {
      return Promise.reject(
        jobsFailure('busy', 'A login operation is in progress.')
      );
    }
    const controller = new AbortController();
    const task = this.run((signal) =>
      this.open(input, globalThis.AbortSignal.any([signal, controller.signal]))
    );
    this.task = task;
    this.controller = controller;
    const clear = () => {
      if (this.task === task) {
        this.task = null;
        this.controller = null;
      }
    };
    task.then(clear, clear);
    return task;
  }
  async open(input, signal) {
    const options = loginOptions(input);
    const id = loginKey(options.requestId);
    const previous = await this.store.get(id);
    if (previous) {
      if (previous.signature !== JSON.stringify(options)) {
        throw jobsFailure(
          'login-conflict',
          'This login ID has different settings.'
        );
      }
      return this.status(options);
    }
    if (owners.has(this.store)) {
      throw jobsFailure('busy', 'A manual login owns this workspace.');
    }
    const policy = await resolveBrowserPolicy(this.store, {
      ...options,
      platform: 'hh',
      slot: options.browserSlot,
    });
    if (policy.headless) {
      throw jobsFailure(
        'login-visible',
        'Manual login needs a visible browser.'
      );
    }
    signal.throwIfAborted();
    const started = this.now();
    this.current = {
      record: {
        id,
        ...options,
        version: 1,
        signature: JSON.stringify(options),
        state: 'opening',
        active: true,
        manual: true,
        authentication: 'unverified',
        startedAt: new Date(started).toISOString(),
        expiresAt: new Date(started + options.durationMs).toISOString(),
        code: null,
      },
    };
    owners.set(this.store, this);
    try {
      await this.save({});
      await saveAcknowledgedRecord(this.store, {
        id: loginLatestKey(options.browserSlot),
        requestId: options.requestId,
      });
      signal.throwIfAborted();
      this.current.browser = await this.openSession({
        store: this.store,
        platform: 'hh',
        useCase: 'jobs',
        slot: options.browserSlot,
        headless: false,
        signal,
      });
      signal.throwIfAborted();
      await this.current.browser.commander.goto({
        url: 'https://hh.ru/account/login',
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      signal.throwIfAborted();
      if (this.now() >= started + options.durationMs) {
        throw jobsFailure('login-expired', 'The manual login window expired.');
      }
      await this.save({ state: 'browser-open' });
      const { browserSlot, requestId, startedAt, expiresAt } =
        this.current.record;
      this.current.notice = {
        id: globalThis.crypto.randomUUID(),
        kind: 'hh-manual-login',
        browserSlot,
        requestId,
        startedAt,
        expiresAt,
      };
      this.arm(started + options.durationMs);
      return this.status(options);
    } catch (error) {
      const state = signal.aborted ? 'cancelled' : 'failed';
      await this.finish(state, 'jobs-login-open');
      throw error;
    }
  }
  arm(expiresAt) {
    const identity = loginIdentity(this.current.record);
    const close = (state) => {
      void this.close(identity, state).catch(() => this.trace('close-failed'));
    };
    this.current.onClose = () => close('closed');
    this.current.browser.page.once('close', this.current.onClose);
    this.timer = this.setTimer(
      () => close('expired'),
      Math.max(1, expiresAt - this.now())
    );
    this.timer.unref?.();
    if (this.current.browser.page.isClosed?.()) {
      close('closed');
    }
  }
  finish(state, code = null) {
    if (!this.finishing) {
      this.finishing = this.finishCurrent(state, code);
      const clear = () => {
        this.finishing = null;
      };
      this.finishing.then(clear, clear);
    }
    return this.finishing;
  }
  async finishCurrent(state, code) {
    const current = this.current;
    if (!current) {
      return;
    }
    this.clearTimer(this.timer);
    if (current.onClose) {
      current.browser.page.off('close', current.onClose);
    }
    try {
      if (!current.browserClosed) {
        await current.browser?.close();
        current.browserClosed = true;
      }
      await this.save({ state, code, active: false });
    } catch (error) {
      if (!current.browser) {
        this.release();
        throw error;
      }
      // The profile stays owned until both close and its receipt are acknowledged.
      await this.save({
        state: 'close-failed',
        code: 'jobs-login-close',
        active: true,
      });
      throw jobsFailure(
        'login-close',
        'The login browser closure was not confirmed.'
      );
    }
    this.release();
  }
  release() {
    this.current = null;
    if (owners.get(this.store) === this) {
      owners.delete(this.store);
    }
  }
  async close(input = {}, state = 'closed') {
    const identity = loginIdentity(input);
    const { login } = await this.status(identity);
    if (!login?.active) {
      return { login };
    }
    const owner = owners.get(this.store);
    if (!owner) {
      return this.status(identity);
    }
    if (owner !== this) {
      return owner.close(identity, state);
    }
    if (!this.closing) {
      this.controller?.abort();
      this.closing = (async () => {
        await this.task?.catch(() => {});
        await this.run(() => this.finish(state));
        return this.status(identity);
      })();
      this.closing.then(
        () => {
          this.closing = null;
        },
        () => {
          this.closing = null;
        }
      );
    }
    return this.closing;
  }
  async stop() {
    this.stopped = true;
    await this.cancel();
  }
  async cancel() {
    const owner = owners.get(this.store);
    if (owner && owner !== this) {
      return owner.cancel();
    }
    this.controller?.abort();
    await this.task?.catch(() => {});
    await this.closing?.catch(() => {});
    await this.finish('cancelled');
  }
}

export const createJobLoginService = (options) => {
  const service = new JobLogin(options);
  return {
    stop: () => service.stop(),
    cancel: () => service.cancel(),
    operations: {
      'login-open': (input) => service.start(input),
      'login-status': (input) => service.status(input),
      'login-close': (input) => service.close(input),
      'login-attention': () => service.attention(),
      'login-attention-focus': (input) => service.focus(input),
    },
  };
};
