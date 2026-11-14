import {
  applicationKey,
  applicationSettings,
} from '../jobs/application-options.js';
import { applicationResult } from '../jobs/application-result.js';

const pendingKey = 'meta-sovereign:hh-application-intent';
const failure = () => new Error('jobs-application-recovery');
const token = (input) => {
  const { url, browserSlot } = applicationKey(input);
  if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(input.requestId ?? '')) {
    throw failure();
  }
  return { url, browserSlot, requestId: input.requestId };
};
const equalTarget = (a, b) =>
  a?.url === b?.url && a?.browserSlot === b?.browserSlot;
export const applicationMayRestart = (receipt) =>
  receipt?.active === false &&
  receipt.delivery === 'none' &&
  receipt.attempted.enter === false &&
  receipt.attempted.submit === false;

/** Keep only the pending identity locally; options and reservations belong to the server. */
export class ApplicationSession {
  constructor(api, storage) {
    this.api = api;
    this.storage = storage;
    this.listeners = new Set();
    this.sequence = 0;
    this.state = {
      intent: null,
      target: null,
      receipt: null,
      known: false,
      missing: false,
      busy: false,
      stopping: false,
      error: null,
    };
    try {
      this.storage = storage ?? globalThis.localStorage;
      const raw = this.storage?.getItem(pendingKey);
      if (raw) {
        if (raw.length > 5000) {
          throw failure();
        }
        this.state.intent = token(JSON.parse(raw));
      }
    } catch {
      this.blockedStorage = true;
      this.state.error = 'jobs-application-recovery';
    }
  }
  publish(change) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispose() {
    this.sequence++;
    this.listeners.clear();
  }
  remember(input) {
    if (!this.storage || this.blockedStorage) {
      throw failure();
    }
    const intent = token(input);
    this.storage.setItem(pendingKey, JSON.stringify(intent));
    this.publish({ intent });
    return intent;
  }
  async select(input) {
    const target = input ? applicationKey(input) : null;
    this.publish({ target });
    if (this.state.busy || this.state.intent) {
      return;
    }
    this.sequence++;
    this.publish({ receipt: null, known: false, missing: false });
    if (target) {
      return this.recover();
    }
  }
  accept(raw, input) {
    const receipt = applicationResult(raw, input);
    const missing = receipt.mode === 'hh-application-missing';
    if (!missing && receipt.state !== 'closed') {
      this.remember(receipt);
    }
    this.publish({
      receipt: missing ? null : receipt,
      known: true,
      missing,
      error: null,
    });
    return receipt;
  }
  async recover() {
    if (this.state.busy || this.blockedStorage) {
      throw failure();
    }
    const input = this.state.intent ?? this.state.target;
    if (!input) {
      return;
    }
    const sequence = ++this.sequence;
    this.publish({ known: false, missing: false, error: null });
    try {
      const raw = await this.api.vacancyApplicationStatus(input);
      if (sequence === this.sequence) {
        return this.accept(raw, input);
      }
    } catch (error) {
      if (sequence === this.sequence) {
        this.publish({
          known: false,
          error: error.code ?? 'jobs-application-recovery',
        });
      }
      throw error;
    }
  }
  async execute(operation, input) {
    if (this.state.busy || !this.state.known || this.blockedStorage) {
      throw failure();
    }
    const sequence = ++this.sequence;
    this.publish({ busy: true, known: false, missing: false, error: null });
    const task = Promise.resolve().then(() => this.api[operation](input));
    this.task = task;
    try {
      const raw = await task;
      if (sequence !== this.sequence) {
        return;
      }
      const receipt = this.accept(raw, input);
      if (receipt.state === 'closed') {
        this.storage.removeItem(pendingKey);
        this.publish({ intent: null });
      }
      return receipt;
    } catch (error) {
      if (sequence === this.sequence) {
        this.publish({
          known: false,
          error: error.code ?? 'jobs-application-recovery',
        });
      }
      throw error;
    } finally {
      if (this.task === task) {
        this.task = null;
      }
      if (sequence === this.sequence) {
        this.publish({ busy: false });
      }
    }
  }
  start(options) {
    if (
      !this.state.known ||
      !(this.state.missing || applicationMayRestart(this.state.receipt)) ||
      !this.state.target ||
      this.state.intent
    ) {
      throw failure();
    }
    const input = {
      ...options,
      ...this.state.target,
      requestId: globalThis.crypto.randomUUID(),
    };
    applicationSettings(input);
    this.remember(input);
    return this.execute('vacancyApplicationOpen', input);
  }
  reopen() {
    if (
      !this.state.intent ||
      !this.state.receipt ||
      this.state.missing ||
      this.state.receipt.active ||
      this.state.receipt.delivery === 'provider-confirmed'
    ) {
      throw failure();
    }
    return this.execute('vacancyApplicationOpen', {
      ...this.state.intent,
      recover: true,
    });
  }
  action(name, extra = {}) {
    if (!this.state.receipt || !this.state.intent || this.state.missing) {
      throw failure();
    }
    return this.execute(`vacancyApplication${name}`, {
      ...extra,
      ...this.state.intent,
      revision: this.state.receipt.revision,
    });
  }
  async release() {
    if (
      this.state.busy ||
      !this.state.known ||
      this.state.receipt?.active ||
      this.blockedStorage
    ) {
      throw failure();
    }
    this.storage.removeItem(pendingKey);
    const restarting =
      equalTarget(this.state.intent ?? this.state.receipt, this.state.target) &&
      applicationMayRestart(this.state.receipt);
    this.publish({ intent: null });
    if (restarting) {
      return;
    }
    return this.select(this.state.target);
  }
  stop() {
    return (this.stopping ??= this.stopCurrent().finally(() => {
      this.stopping = null;
    }));
  }
  async stopCurrent() {
    const sequence = ++this.sequence;
    const pending = this.task;
    this.publish({ busy: true, stopping: true, known: false, missing: false });
    try {
      const result = await this.api.vacancyCancel();
      if (!result || result.ok === false || result.code) {
        throw failure();
      }
      await pending?.catch(() => {});
    } catch (error) {
      if (sequence === this.sequence) {
        this.publish({ error: error.code ?? 'jobs-application-recovery' });
      }
      throw error;
    } finally {
      if (sequence === this.sequence) {
        this.publish({ busy: false, stopping: false });
      }
    }
    return this.recover();
  }
}
