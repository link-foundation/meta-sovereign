import { applicationState } from './application-options.js';

export const applicationHoldReasons = [
  'generic-error',
  'validation-error',
  'verification',
  'daily-limit',
  'external',
];

/** Dismissing native errors never grants automatic sending permission. */
export class ApplicationHolds {
  constructor(trace = () => {}) {
    this.entries = new Map();
    this.trace = trace;
  }
  read(id) {
    return this.entries.get(id) ?? null;
  }
  observe(record, page = record.page, state = applicationState(page)) {
    const previous = this.read(record.id);
    if (page.bound) {
      const reason = state === 'provider-error' ? page.error : state;
      if (state === 'delivered') {
        this.entries.delete(record.id);
      } else if (applicationHoldReasons.includes(reason)) {
        this.entries.set(record.id, reason);
      }
    }
    record.hold = this.read(record.id);
    if (previous !== record.hold) {
      this.trace({ event: 'application-manual-hold', reason: record.hold });
    }
  }
  clear() {
    this.entries.clear();
  }
}
