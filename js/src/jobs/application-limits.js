import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { applicationFailure as fail } from './application-options.js';
import {
  applicationLimitId,
  applicationLimitPrefix,
  applicationLimitMs,
  readApplicationLimitRow,
} from './application-limit-data.js';

/** Conservative workspace scope until native HH account/slot binding is verified. */
export class ApplicationLimits {
  constructor(service, now = Date.now) {
    this.service = service;
    this.now = now;
    this.pending = null;
    this.observations = new Map();
  }
  async row() {
    const saved = readApplicationLimitRow(
      await this.service.store.get(applicationLimitId),
      applicationLimitId
    );
    return this.pending &&
      (!saved || Date.parse(this.pending.until) >= Date.parse(saved.until))
      ? this.pending
      : saved;
  }
  view(row) {
    return row
      ? {
          scope: 'workspace',
          observedAt: row.observedAt,
          until: row.until,
          active: this.now() < Date.parse(row.until),
          saved: row !== this.pending,
        }
      : null;
  }
  async read() {
    return this.view(await this.row());
  }
  async admit(record) {
    record.applicationLimit = await this.read();
    if (record.applicationLimit?.active) {
      throw fail('limit-wait');
    }
  }
  async observe(record, page = record.page) {
    if (!page.bound || !page.dailyLimit) {
      record.applicationLimit = await this.read();
      return;
    }
    const { service } = this;
    const id = `${applicationLimitPrefix}document:${record.browserSlot}:${record.url.split('/').at(-1)}`;
    const previous = readApplicationLimitRow(await service.store.get(id), id);
    const observedDocument = this.observations.get(id) ?? previous?.documentKey;
    let current = await this.row();
    // Remember the witnessed document even when its private checkpoint fails.
    this.observations.set(id, page.documentKey);
    // The same failed native document never starts another pause after expiry.
    if (
      observedDocument !== page.documentKey &&
      current?.documentKey !== page.documentKey &&
      (!current || this.now() >= Date.parse(current.until))
    ) {
      const observedAt = this.now();
      current = {
        id: applicationLimitId,
        version: 1,
        scope: 'workspace',
        observedAt: new Date(observedAt).toISOString(),
        until: new Date(observedAt + applicationLimitMs).toISOString(),
        documentKey: page.documentKey,
      };
      readApplicationLimitRow(current, applicationLimitId);
      // Refusal remains effective in this worker even when disk cannot acknowledge it.
      this.pending = current;
    }
    if (this.pending) {
      await saveAcknowledgedRecord(service.store, this.pending);
      this.pending = null;
      service.trace({
        event: 'application-limit-saved',
        pauseMs: applicationLimitMs,
      });
    }
    if (current && previous?.documentKey !== page.documentKey) {
      await saveAcknowledgedRecord(service.store, {
        ...current,
        id,
        documentKey: page.documentKey,
      });
    }
    record.applicationLimit = await this.read();
  }
}
