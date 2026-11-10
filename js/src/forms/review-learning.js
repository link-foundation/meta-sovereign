import { formAnswerPairs, formFieldIdentity } from './answer-pairs.js';

const validEvidence = (value) =>
  value &&
  ['edits', 'intent'].every(
    (key) => Number.isSafeInteger(value[key]) && value[key] >= 0
  ) &&
  ['at', 'editedAt', 'documentTime'].every(
    (key) => Number.isFinite(value[key]) && value[key] >= 0
  ) &&
  ['confirmation', 'responseUrl'].every(
    (key) => typeof value[key] === 'boolean'
  ) &&
  Array.isArray(value.changes) &&
  value.changes.length <= 200 &&
  value.changes.every(
    (change) =>
      Number.isInteger(change.index) &&
      change.index >= 0 &&
      change.index < 2000 &&
      Number.isFinite(change.at) &&
      change.at >= 0
  ) &&
  typeof value.frame === 'string';

const updateObserved = (entry, pair, evidence, time) => {
  if (evidence.at < entry.armedAt || evidence.at < entry.observedAt) {
    return;
  }
  const changed = pair.text !== entry.pair.text;
  const editedAt = Math.max(
    0,
    ...evidence.changes
      .filter((change) => pair.controls.includes(change.index))
      .map((change) => change.at)
  );
  const touched = editedAt > entry.editedAt;
  if (changed) {
    entry.ownerChanged =
      evidence.edits > 0 &&
      editedAt >= entry.armedAt &&
      evidence.at - editedAt <= 1500 &&
      pair.text !== entry.baseline;
    entry.pair = pair;
    entry.version++;
  }
  if (changed || touched) {
    entry.changedAt = time;
  }
  entry.editedAt = editedAt;
  entry.observedAt = evidence.at;
};
const completionKind = (report, evidence) =>
  evidence.confirmation
    ? 'confirmation'
    : evidence.responseUrl
      ? 'response-url'
      : report.fields.length === 0
        ? 'form-disappeared'
        : null;
const completionMatches = (intent, evidence, time) =>
  intent &&
  evidence.frame === intent.frame &&
  time - intent.at <= 120000 &&
  evidence.at >= intent.observedAt &&
  !(evidence.responseStatus >= 400);

class FormLearning {
  constructor({
    enabled = true,
    now = () => Date.now(),
    timers = globalThis,
    stableMs = 60000,
    read,
    save,
    trace,
  } = {}) {
    if (!Number.isInteger(stableMs) || stableMs < 1 || stableMs > 60000) {
      throw new Error('Use a bounded form stability interval.');
    }
    Object.assign(this, { enabled, now, timers, stableMs, read, save, trace });
    this.state = {
      enabled,
      state: enabled ? 'waiting-plan' : 'disabled',
      tracked: 0,
      saved: 0,
      skipped: 0,
      omitted: 0,
      failed: 0,
      completion: null,
      approved: false,
    };
    this.entries = new Map();
    this.intents = new Map();
    this.profileId = '';
    this.stopped = false;
    this.paused = false;
    this.pending = Promise.resolve();
    this.bytes = 0;
    this.stablePending = false;
    this.retryAt = 0;
    this.failures = 0;
  }
  failure(error) {
    if (error.code === 'form-store-busy') {
      this.state.error = error.code;
      this.retryAt = this.now() + 5000;
      return;
    }
    this.state.failed++;
    if (error.partial?.saved) {
      this.state.saved += error.partial.saved;
      this.state.last = { kind: 'partial', ...error.partial };
    }
    this.state.error = error.code ?? 'form-learning-failed';
    this.trace?.({ event: 'form-learning-failed', code: this.state.error });
    this.retryAt = this.now() + 1000;
    if (++this.failures >= 3) {
      this.state.state = 'failed';
    }
  }
  enqueue(operation) {
    this.pending = this.pending
      .then(operation)
      .catch((error) => this.failure(error));
    return this.pending;
  }
  async persist(selected, kind, report) {
    if (!selected.length || this.stopped) {
      return;
    }
    const versions = selected.map((entry) => entry.version);
    const profileId = this.profileId;
    const pairs = selected.map((entry, index) => ({
      ...entry.pair,
      evidence: `form:${kind}:${index}:${globalThis.crypto.randomUUID()}`,
    }));
    const unchanged = () => {
      if (
        this.stopped ||
        this.paused ||
        this.profileId !== profileId ||
        selected.some(
          (entry, index) =>
            this.entries.get(entry.pair.key) !== entry ||
            entry.version !== versions[index]
        )
      ) {
        throw Object.assign(
          new Error('Observed form answers changed before learning.'),
          { code: 'form-learning-changed' }
        );
      }
    };
    const check = async () => {
      unchanged();
      // A storage wait may outlast the document's debounced snapshot. Re-read
      // stable edits inside that queue immediately before a proposal is saved.
      if (kind === 'stable-owner-edit') {
        const current = await this.read();
        const actual = new Map(
          current
            ? formAnswerPairs(current).map((pair) => [pair.key, pair.text])
            : []
        );
        if (pairs.some((pair) => actual.get(pair.key) !== pair.text)) {
          throw Object.assign(new Error('The live form answer changed.'), {
            code: 'form-learning-changed',
          });
        }
      }
      unchanged();
    };
    const result = await this.save(pairs, { profileId, kind, report, check });
    this.failures = 0;
    this.state.saved += result.saved;
    this.state.skipped += result.skipped;
    this.state.last = {
      kind,
      ...result,
      at: new Date(this.now()).toISOString(),
    };
    this.state.error = null;
    for (const [index, entry] of selected.entries()) {
      if (entry.version === versions[index]) {
        entry.ownerChanged = false;
      }
    }
  }
  async stable() {
    if (this.stopped || this.paused) {
      return;
    }
    const due = [...this.entries.values()].filter(
      (entry) =>
        entry.ownerChanged && this.now() - entry.changedAt >= this.stableMs
    );
    if (!due.length) {
      return;
    }
    const report = await this.read();
    if (!report) {
      this.retryAt = this.now() + 1000;
      return;
    }
    const current = new Map(
      formAnswerPairs(report).map((pair) => [pair.key, pair])
    );
    const selected = due.filter(
      (entry) =>
        current.get(entry.pair.key)?.text === entry.pair.text &&
        entry.ownerChanged &&
        this.now() - entry.changedAt >= this.stableMs
    );
    for (const entry of due) {
      if (!selected.includes(entry)) {
        entry.ownerChanged = false;
      }
    }
    await this.persist(selected, 'stable-owner-edit', report);
  }
  schedule() {
    this.timers.clearTimeout(this.timer);
    const candidates = [...this.entries.values()].filter(
      (entry) => entry.ownerChanged
    );
    if (
      this.stopped ||
      this.paused ||
      this.stablePending ||
      this.state.state !== 'watching' ||
      !candidates.length
    ) {
      return;
    }
    const delay = Math.max(
      1,
      this.retryAt - this.now(),
      Math.min(
        ...candidates.map(
          (entry) => entry.changedAt + this.stableMs - this.now()
        )
      )
    );
    this.timer = this.timers.setTimeout(() => {
      this.stablePending = true;
      this.enqueue(() => this.stable()).finally(() => {
        this.stablePending = false;
        this.schedule();
      });
    }, delay);
    this.timer.unref?.();
  }
  retain(pair) {
    const size = JSON.stringify(pair).length * 2;
    const prior = this.entries.get(pair.key);
    const nextBytes = this.bytes - (prior?.bytes ?? 0) + size;
    if ((!prior && this.entries.size >= 1000) || nextBytes > 2 * 1024 ** 2) {
      this.state.omitted++;
      if (prior) {
        this.bytes -= prior.bytes;
        this.entries.delete(pair.key);
      }
      return null;
    }
    this.bytes = nextBytes;
    return size;
  }
  arm(report, options = {}) {
    if (!this.enabled || this.stopped) {
      return;
    }
    const profileId = options.profileId ?? '';
    if (profileId !== this.profileId) {
      this.entries.clear();
      this.bytes = 0;
      this.intent = null;
    }
    this.profileId = profileId;
    this.intent = null;
    const time = this.now();
    for (const pair of formAnswerPairs(report)) {
      const size = this.retain(pair);
      if (size === null) {
        continue;
      }
      this.entries.set(pair.key, {
        pair,
        baseline: pair.text,
        bytes: size,
        armedAt: time,
        observedAt: time,
        changedAt: time,
        editedAt: time,
        ownerChanged: false,
        version: 0,
      });
    }
    this.state.tracked = this.entries.size;
    this.state.state = 'watching';
    this.state.error = null;
    this.failures = 0;
    this.schedule();
  }
  applied(result) {
    if (!this.enabled || this.stopped || !result.report) {
      return;
    }
    const confirmed = new Set(
      result.receipts
        ?.filter((receipt) => ['applied', 'unchanged'].includes(receipt.status))
        .map((receipt) => receipt.fieldId)
    );
    const changed = new Set(
      result.report.fields
        .filter((field) => confirmed.has(field.id))
        .map((field) => formFieldIdentity(field, result.report))
    );
    for (const pair of formAnswerPairs(result.report)) {
      const entry = this.entries.get(pair.key);
      if (entry && pair.members.some((key) => changed.has(key))) {
        const size = this.retain(pair);
        if (size === null) {
          continue;
        }
        entry.bytes = size;
        entry.pair = pair;
        entry.baseline = pair.text;
        entry.ownerChanged = false;
        entry.version++;
      }
    }
    this.schedule();
  }
  update(report, evidence) {
    for (const pair of formAnswerPairs(report)) {
      const entry = this.entries.get(pair.key);
      if (!entry) {
        continue;
      }
      if (evidence.at < entry.armedAt || evidence.at < entry.observedAt) {
        continue;
      }
      const size = this.retain(pair);
      if (size === null) {
        continue;
      }
      entry.bytes = size;
      updateObserved(entry, pair, evidence, this.now());
    }
    this.state.tracked = this.entries.size;
  }
  rememberIntent(evidence) {
    const key = `${evidence.frame}:${evidence.documentTime}`;
    if (evidence.intent <= (this.intents.get(key) ?? 0)) {
      return;
    }
    if (this.intents.size >= 32 && !this.intents.has(key)) {
      this.intents.delete(this.intents.keys().next().value);
    }
    this.intents.set(key, evidence.intent);
    this.intent = {
      at: this.now(),
      observedAt: evidence.at,
      frame: evidence.frame,
    };
  }
  observe = async (report, evidence) => {
    if (
      !this.enabled ||
      this.stopped ||
      this.paused ||
      !validEvidence(evidence) ||
      this.state.state !== 'watching'
    ) {
      return;
    }
    this.update(report, evidence);
    this.rememberIntent(evidence);
    const completion = completionKind(report, evidence);
    if (completion && completionMatches(this.intent, evidence, this.now())) {
      this.state.completion = {
        kind: completion,
        at: new Date(this.now()).toISOString(),
      };
      this.intent = null;
      const submitted = [...this.entries.values()];
      await this.enqueue(() =>
        this.persist(submitted, 'observed-submission', report)
      );
    }
    this.schedule();
  };
  incomplete(reason = 'capture-incomplete') {
    if (!this.enabled || this.stopped) {
      return;
    }
    this.entries.clear();
    this.bytes = 0;
    this.intent = null;
    this.state.tracked = 0;
    this.state.state = 'incomplete';
    this.state.error = reason;
    this.timers.clearTimeout(this.timer);
  }
  settle() {
    return this.pending;
  }
  status() {
    return globalThis.structuredClone(this.state);
  }
  async stop() {
    this.stopped = true;
    this.timers.clearTimeout(this.timer);
    await this.pending;
    if (this.enabled) {
      this.state.state = 'stopped';
    }
  }
  async pause(value) {
    this.paused = value;
    this.timers.clearTimeout(this.timer);
    if (value) {
      await this.pending;
    } else {
      this.schedule();
    }
  }
}

/** One bounded learner per owned slot. Snapshots alone never arm learning. */
export const createFormLearning = (options) => new FormLearning(options);
