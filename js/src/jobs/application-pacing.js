import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { applicationFailure as fail } from './application-options.js';
import {
  applicationPacingId,
  readApplicationPacingRow,
  applicationPacingData,
} from './application-pacing-data.js';

const same = (row, record) =>
  row?.applicationId === record.id && row.requestId === record.requestId;
const schedule = (row) => {
  row.intervalMs =
    row.intervalSeconds === 0
      ? Math.min(
          240000,
          row.baseMs + Math.floor((row.baseMs * row.variation) / 4)
        )
      : row.intervalSeconds * 1000;
  row.nextAt = new Date(
    Date.parse(row.startedAt) + row.intervalMs
  ).toISOString();
  return row;
};

/** Optional paced review admission; existing reviews and chats keep their ownership. */
export class ApplicationPacing {
  constructor(service, now, random = Math.random) {
    Object.assign(this, { service, now, random });
    this.pending = null;
  }
  fraction() {
    const value = this.random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw fail('pacing-random');
    }
    return value;
  }
  async row() {
    return (
      this.pending ??
      readApplicationPacingRow(
        await this.service.store.get(applicationPacingId)
      )
    );
  }
  async save(row) {
    readApplicationPacingRow(row);
    this.pending = globalThis.structuredClone(row);
    await saveAcknowledgedRecord(this.service.store, row);
    this.pending = null;
  }
  async flush() {
    if (this.pending) {
      await this.save(this.pending);
    }
  }
  async read() {
    const row = await this.row();
    return row
      ? applicationPacingData({
          scope: 'workspace',
          mode: row.intervalSeconds === 0 ? 'adaptive' : 'fixed',
          startedAt: row.startedAt,
          nextAt: row.nextAt,
          intervalMs: row.intervalMs,
          baseMs: row.baseMs,
          deliveries: row.deliveries,
          challenges: row.challenges,
          holdUntil: row.holdUntil,
          waiting: this.now() < Date.parse(row.nextAt),
          saved: !this.pending,
        })
      : null;
  }
  async admit(options, previous, signal) {
    if (options.testMode || previous?.delivery === 'provider-confirmed') {
      return;
    }
    await this.flush();
    const row = await this.row();
    signal.throwIfAborted();
    // Reopening the same owned review neither starts a new cycle nor shortens it.
    if (same(row, options)) {
      return;
    }
    if (options.applicationIntervalSeconds !== undefined) {
      // A paced admission reports the durable provider pause before spacing.
      await this.service.limits.admit({});
      signal.throwIfAborted();
    }
    if (row && this.now() < Date.parse(row.nextAt)) {
      throw fail('pace-wait');
    }
    if (options.applicationIntervalSeconds === undefined) {
      return;
    }
    await this.reserve(options, row);
    this.service.trace({
      event: 'application-pace-reserved',
      intervalSeconds: options.applicationIntervalSeconds,
    });
  }
  async reserve(options, row) {
    await this.save(
      schedule({
        id: applicationPacingId,
        version: 1,
        scope: 'workspace',
        applicationId: options.id,
        requestId: options.requestId,
        intervalSeconds: options.applicationIntervalSeconds,
        startedAt: new Date(this.now()).toISOString(),
        variation: this.fraction(),
        baseMs: row?.baseMs ?? 120000,
        deliveries: row?.deliveries ?? 0,
        challenges: row?.challenges ?? 0,
        holdStartedAt: row?.holdStartedAt ?? null,
        holdUntil: row?.holdUntil ?? null,
        delivered: false,
        documents: [],
      })
    );
  }
  feedback(row, record, page) {
    if (page.challenge && !row.documents.includes(page.documentKey)) {
      if (row.documents.length >= 64) {
        throw fail('pacing-observations');
      }
      row.documents.push(page.documentKey);
      row.challenges++;
      row.baseMs = Math.min(
        240000,
        row.baseMs + 10000 + Math.floor(this.fraction() * 10001)
      );
      const start =
        row.holdUntil && this.now() < Date.parse(row.holdUntil)
          ? Date.parse(row.holdStartedAt)
          : this.now();
      row.holdStartedAt = new Date(start).toISOString();
      row.holdUntil = new Date(
        Math.min(start + 900000, this.now() + 300000)
      ).toISOString();
      return 'challenge';
    } else if (
      !page.challenge &&
      page.delivered &&
      !row.delivered &&
      record.acknowledged?.delivery !== 'provider-confirmed'
    ) {
      row.delivered = true;
      row.deliveries++;
      if (!row.holdUntil || this.now() >= Date.parse(row.holdUntil)) {
        row.baseMs = Math.max(
          60000,
          row.baseMs - 10000 - Math.floor(this.fraction() * 10001)
        );
      }
      return 'delivery';
    }
  }
  async observe(record, signal, page = record.page) {
    if (
      record.options.applicationIntervalSeconds === undefined ||
      record.options.testMode
    ) {
      return;
    }
    await this.flush();
    const row = await this.row();
    signal.throwIfAborted();
    if (!same(row, record) || !page.bound || page.external || page.dailyLimit) {
      return;
    }
    const event = this.feedback(row, record, page);
    if (event) {
      signal.throwIfAborted();
      await this.save(schedule(row));
      this.service.trace({
        event: 'application-pace-observed',
        outcome: event,
        baseMs: row.baseMs,
      });
    }
  }
}
