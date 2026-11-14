import {
  applicationFailure as fail,
  applicationState,
} from './application-options.js';

const names = ['noQuestionnaires', 'paused'];
const defaults = () => ({ noQuestionnaires: false, paused: false });

/** Freeze automatic preservation admission across every awaited checkpoint. */
export const applicationPreservationPolicy = (service, record, signal) => {
  const version = service.modes.version(record.browserSlot);
  return () => {
    signal.throwIfAborted();
    if (
      service.current !== record ||
      record.paused ||
      service.modes.version(record.browserSlot) !== version
    ) {
      throw fail('mode-changed');
    }
  };
};
export const applyApplicationRunPolicy = (record) => {
  if (
    record.page &&
    ['ready', 'review', 'review-delay', 'paused', 'deferred'].includes(
      record.state
    )
  ) {
    record.state = applicationState(record.page);
    if (['ready', 'review'].includes(record.state) && record.paused) {
      record.state = 'paused';
    } else if (
      record.state === 'review' &&
      record.noQuestionnaires &&
      record.page.questions
    ) {
      record.state = 'deferred';
    }
  }
};

/** Worker-owned policy; neither journals nor durable exclusion lists store it. */
export class ApplicationRunModes {
  constructor() {
    this.slots = new Map();
    this.versions = new Map();
  }
  read(slot) {
    return { ...(this.slots.get(slot) ?? defaults()) };
  }
  change(slot, input) {
    if (
      !names.some((name) => input[name] !== undefined) ||
      names.some(
        (name) => input[name] !== undefined && typeof input[name] !== 'boolean'
      )
    ) {
      throw fail('input');
    }
    return {
      ...this.read(slot),
      ...Object.fromEntries(
        names
          .filter((name) => input[name] !== undefined)
          .map((name) => [name, input[name]])
      ),
    };
  }
  save(slot, modes) {
    this.slots.set(slot, { ...modes });
    this.versions.set(slot, this.version(slot) + 1);
  }
  version(slot) {
    return this.versions.get(slot) ?? 0;
  }
  apply(record) {
    Object.assign(record, this.read(record.browserSlot));
    applyApplicationRunPolicy(record);
  }
  signal(record, slot, noQuestionnaires) {
    const modes = this.change(slot, { noQuestionnaires });
    this.save(slot, modes);
    if (record?.browserSlot === slot) {
      this.apply(record);
    }
    return modes;
  }
  clear() {
    this.slots.clear();
    this.versions.clear();
  }
}
