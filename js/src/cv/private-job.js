import { saveAcknowledgedRecord } from '../storage/acknowledged-record.js';
import { resumeExportRequestId } from '../jobs/resume-export-options.js';

/** One durable, caller-owned job. Reads never launch work; Stop drains before returning. */
export class PrivateCvJob {
  constructor(config) {
    Object.assign(this, config);
    this.tail = Promise.resolve();
  }
  serial(work) {
    const next = this.tail.then(work);
    this.tail = next.catch(() => {});
    return next;
  }
  async save(owned, patch) {
    const row = await this.checked(
      { ...owned.row, ...patch },
      owned.row.requestId
    );
    await saveAcknowledgedRecord(this.store, row);
    owned.row = row;
  }
  async status({ requestId }) {
    const id = resumeExportRequestId(requestId);
    await this.tail;
    const active = this.current?.row.requestId === id;
    const row = active
      ? this.current.row
      : await this.checked(await this.store.get(this.key(id)), id);
    return this.view(row, active);
  }
  async start(input) {
    if (this.closing) {
      throw this.failure('stopped');
    }
    const options = await this.optionsFor(input);
    const prior = await this.store.get(this.key(options.requestId));
    if (prior) {
      const row = await this.checked(prior, options.requestId);
      if (
        row.options &&
        JSON.stringify(row.options) !== JSON.stringify(options)
      ) {
        throw this.failure('conflict');
      }
      return this.view(row, this.current?.row.requestId === options.requestId);
    }
    if (this.current) {
      throw this.failure('busy');
    }
    const owned = {
      controller: new AbortController(),
      row: this.newRecord(options.requestId, options),
    };
    await saveAcknowledgedRecord(this.store, owned.row);
    this.current = owned;
    owned.task = Promise.resolve()
      .then(() => this.work(owned, (patch) => this.save(owned, patch)))
      .catch(() => {})
      .finally(() => {
        if (this.current === owned) {
          this.current = null;
        }
      });
    return this.view(owned.row, true);
  }
  async stop({ requestId }) {
    const id = resumeExportRequestId(requestId);
    if (this.current?.row.requestId === id) {
      this.current.controller.abort();
      await this.current.task;
    }
    let row = await this.store.get(this.key(id));
    if (!row) {
      row = this.newRecord(id);
      await saveAcknowledgedRecord(this.store, row);
    }
    return this.view(await this.checked(row, id), false);
  }
  close() {
    return (this.closing ??= this.serial(async () => {
      this.current?.controller.abort();
      await this.current?.task;
    }));
  }
  controls() {
    return {
      start: (input) => this.serial(() => this.start(input)),
      status: (input) => this.status(input),
      stop: (input) => this.serial(() => this.stop(input)),
      close: () => this.close(),
    };
  }
}
