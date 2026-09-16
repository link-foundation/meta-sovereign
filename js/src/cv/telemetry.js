/**
 * CV automation telemetry (R-V13).
 *
 * The issue asks for full observability *before* we have authenticated
 * access: "as soon as we start testing we will be able to get all logs,
 * recordings of markup change and so on, so it will be easy to debug
 * and fix everything". So every run records, per step: what it tried,
 * which selector matched (and which fallback did, if the first missed),
 * how long it took, what it read or wrote, and a fingerprint of the
 * markup it saw. Fingerprints are diffed against the previous run, so a
 * silent layout change on hh.ru or LinkedIn surfaces as a
 * `markup.changed` event instead of an empty CV.
 *
 * Personal data is redacted by default: telemetry is meant to be
 * attachable to a bug report.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Events a run can emit, in the order a healthy run produces them. */
export const TELEMETRY_EVENTS = [
  'run.start',
  'step.start',
  'step.ok',
  'step.miss',
  'step.skip',
  'step.error',
  'selector.fallback',
  'markup.fingerprint',
  'markup.changed',
  'screenshot',
  'value.read',
  'value.write',
  'run.finish',
];

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+\d[\d\s()-]{7,}\d)/g;
const TOKEN = /\b(?:[A-Za-z0-9_-]{24,})\b/g;

/**
 * Replace personal data with typed placeholders, keeping the shape of
 * the value so a bug report still shows "a phone was there".
 */
export const redactText = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replace(EMAIL, '<email>')
    .replace(PHONE, '<phone>')
    .replace(TOKEN, '<token>');
};

const redactValue = (value, depth = 0) => {
  if (depth > 6 || value === null || value === undefined) {
    return value ?? null;
  }
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactValue(entry, depth + 1),
      ])
    );
  }
  return value;
};

/** FNV-1a: short, stable and dependency-free — enough to spot a change. */
const fnv1a = (input) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const countMatches = (html, pattern) => (html.match(pattern) ?? []).length;

/**
 * Structural fingerprint of a markup fragment. Deliberately ignores
 * text content — we want to notice that a *layout* changed, not that
 * the user edited their headline.
 * @param {string} html
 * @param {object} [context] `{ selector, url }` for the report
 */
export const fingerprintMarkup = (html, context = {}) => {
  const markup = typeof html === 'string' ? html : '';
  const structure = markup
    .replace(/>[^<]*</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
  const attributes = [
    ...new Set(
      (markup.match(/\sdata-(?:qa|test|testid|automation)="[^"]*"/g) ?? []).map(
        (entry) => entry.trim()
      )
    ),
  ].sort();
  return {
    hash: fnv1a(structure),
    length: markup.length,
    nodes: countMatches(markup, /<[a-zA-Z][^>]*>/g),
    forms: countMatches(markup, /<form\b/gi),
    inputs: countMatches(markup, /<(?:input|textarea|select)\b/gi),
    buttons: countMatches(markup, /<button\b/gi),
    testIds: attributes,
    selector: context.selector ?? null,
    url: context.url ?? null,
  };
};

const RATIO_TOLERANCE = 0.2;

/**
 * Compare two fingerprints of the same selector.
 * @returns {{changed: boolean, reasons: string[], addedTestIds: string[], removedTestIds: string[]}}
 */
export const diffFingerprint = (before, after) => {
  if (!before || !after) {
    return {
      changed: false,
      reasons: [],
      addedTestIds: [],
      removedTestIds: [],
    };
  }
  const reasons = [];
  if (before.hash !== after.hash) {
    reasons.push(`structure ${before.hash} -> ${after.hash}`);
  }
  for (const key of ['forms', 'inputs', 'buttons', 'nodes']) {
    if (before[key] !== after[key]) {
      reasons.push(`${key} ${before[key]} -> ${after[key]}`);
    }
  }
  const beforeIds = new Set(before.testIds ?? []);
  const afterIds = new Set(after.testIds ?? []);
  const addedTestIds = [...afterIds].filter((id) => !beforeIds.has(id));
  const removedTestIds = [...beforeIds].filter((id) => !afterIds.has(id));
  if (removedTestIds.length > 0) {
    // The most actionable signal: a selector we depend on disappeared.
    reasons.push(`test ids removed: ${removedTestIds.join(', ')}`);
  }
  if (addedTestIds.length > 0) {
    reasons.push(`test ids added: ${addedTestIds.join(', ')}`);
  }
  const shrank =
    before.length > 0 &&
    Math.abs(after.length - before.length) / before.length > RATIO_TOLERANCE;
  if (shrank) {
    reasons.push(`size ${before.length} -> ${after.length}`);
  }
  return {
    changed: reasons.length > 0,
    reasons,
    addedTestIds,
    removedTestIds,
  };
};

/** Collect events in memory — the default, and what tests assert on. */
export const createMemorySink = () => {
  const events = [];
  return {
    kind: 'memory',
    events,
    async write(event) {
      events.push(event);
    },
    filter: (type) => events.filter((event) => event.type === type),
  };
};

/** Append events as JSON Lines so a long run streams to disk. */
export const createJsonlSink = (filePath) => ({
  kind: 'jsonl',
  path: filePath,
  async write(event) {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
  },
});

/** Persist each run as a link so telemetry syncs like everything else. */
export const createStoreSink = (store, { prefix = 'cv-telemetry' } = {}) => ({
  kind: 'store',
  async write(event) {
    const id = `${prefix}:${event.runId}:${String(event.seq).padStart(4, '0')}`;
    await store.put({
      id,
      tokens: [prefix, event.runId, event.type],
      event,
    });
  },
});

/** Keys the run envelope owns; payloads may not overwrite them. */
const ENVELOPE_KEYS = [
  'seq',
  'runId',
  'platform',
  'mode',
  'type',
  'at',
  'elapsedMs',
];

/** Fan an event out to several sinks; one failing sink never kills a run. */
export const combineSinks = (...sinks) => ({
  kind: 'combined',
  sinks,
  async write(event) {
    for (const sink of sinks) {
      try {
        await sink.write(event);
      } catch (error) {
        console.warn(`telemetry sink ${sink.kind} failed: ${error.message}`);
      }
    }
  },
});

const noopSink = { kind: 'noop', async write() {} };

/**
 * Start a telemetry run.
 *
 * @param {object} options
 * @param {string} options.platform platform id
 * @param {'read'|'update'|'dry-run'} options.mode
 * @param {object} [options.sink] anything with `write(event)`
 * @param {() => number} [options.now] injectable clock (tests)
 * @param {boolean} [options.redact] redact personal data (default true)
 * @param {object} [options.baseline] previous run's fingerprints, keyed by selector
 * @param {string} [options.artifactDir] where snapshots/screenshots land
 * @param {boolean} [options.verbose] also mirror events to the console
 */
export const createTelemetryRun = ({
  platform,
  mode = 'read',
  sink = noopSink,
  now = () => Date.now(),
  redact = true,
  baseline = {},
  artifactDir = null,
  runId = `${platform}-${new Date(now()).toISOString()}`,
  verbose = false,
} = {}) => {
  const startedAt = now();
  const events = [];
  const fingerprints = {};
  const problems = [];
  let seq = 0;

  const emit = async (type, data = {}) => {
    seq += 1;
    const payload = { ...(redact ? redactValue(data) : data) };
    // The envelope identifies the run; a payload key of the same name
    // must never shadow it. `run.finish` repeats `runId`/`platform`,
    // and redaction would otherwise rewrite the run id (it looks like
    // a token) and split one run into two in every telemetry query.
    for (const key of ENVELOPE_KEYS) {
      delete payload[key];
    }
    const event = {
      seq,
      runId,
      platform,
      mode,
      type,
      at: new Date(now()).toISOString(),
      elapsedMs: now() - startedAt,
      ...payload,
    };
    events.push(event);
    if (verbose) {
      console.log(`[cv:${platform}] ${type} ${JSON.stringify(event)}`);
    }
    await sink.write(event);
    return event;
  };

  const stepLabel = (step, index) =>
    `${index}:${step.action}${step.path ? ` ${step.path}` : ''}`;

  return {
    runId,
    platform,
    mode,
    events,
    fingerprints,
    problems,

    emit,

    async start(details = {}) {
      return emit('run.start', details);
    },

    /** Time one step; the callback receives a per-step reporter. */
    async step(step, index, run) {
      const begunAt = now();
      const label = stepLabel(step, index);
      await emit('step.start', {
        step: label,
        action: step.action,
        path: step.path ?? null,
        selector: step.selector ?? null,
        confidence: step.confidence,
        optional: Boolean(step.optional),
      });
      const reporter = {
        fallback: (from, to) =>
          emit('selector.fallback', { step: label, from, to }),
        read: (path, value) => emit('value.read', { step: label, path, value }),
        write: (path, value) =>
          emit('value.write', { step: label, path, value }),
        miss: (reason) => emit('step.miss', { step: label, reason }),
      };
      try {
        const result = await run(reporter);
        await emit('step.ok', {
          step: label,
          durationMs: now() - begunAt,
          ...(result?.telemetry ?? {}),
        });
        return result;
      } catch (error) {
        problems.push(`${label}: ${error.message}`);
        await emit('step.error', {
          step: label,
          durationMs: now() - begunAt,
          message: error.message,
          stack: error.stack ?? null,
        });
        throw error;
      }
    },

    async skip(step, index, reason) {
      return emit('step.skip', { step: stepLabel(step, index), reason });
    },

    /**
     * Record a markup fingerprint and report drift against the baseline.
     * @returns {Promise<{fingerprint: object, drift: object}>}
     */
    async snapshot(name, html, context = {}) {
      const fingerprint = fingerprintMarkup(html, context);
      fingerprints[name] = fingerprint;
      await emit('markup.fingerprint', { name, fingerprint });
      const drift = diffFingerprint(baseline[name], fingerprint);
      if (drift.changed) {
        problems.push(`markup changed at ${name}: ${drift.reasons.join('; ')}`);
        await emit('markup.changed', { name, ...drift });
      }
      if (artifactDir && typeof html === 'string') {
        const file = join(artifactDir, runId, `${name}.html`);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, redact ? redactText(html) : html, 'utf8');
        await emit('screenshot', { name, kind: 'html', path: file });
      }
      return { fingerprint, drift };
    },

    async screenshot(name, buffer) {
      if (!artifactDir || !buffer) {
        return emit('screenshot', { name, kind: 'skipped', path: null });
      }
      const file = join(artifactDir, runId, `${name}.png`);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, buffer);
      return emit('screenshot', { name, kind: 'png', path: file });
    },

    /** Close the run and return a report suitable for a bug attachment. */
    async finish(summary = {}) {
      const counts = events.reduce((acc, event) => {
        acc[event.type] = (acc[event.type] ?? 0) + 1;
        return acc;
      }, {});
      const report = {
        runId,
        platform,
        mode,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(now()).toISOString(),
        durationMs: now() - startedAt,
        counts,
        problems: [...problems],
        fingerprints,
        ...summary,
      };
      await emit('run.finish', report);
      return { ...report, events: [...events] };
    },
  };
};

/** Fingerprints of a finished run, ready to be fed back as `baseline`. */
export const baselineFromReport = (report) => ({ ...report?.fingerprints });
