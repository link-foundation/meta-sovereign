/**
 * Step vocabulary shared by every CV platform plan (R-V3).
 *
 * A plan is plain data: an ordered list of steps that the runner
 * interprets against a browser-commander instance. Keeping the plans
 * declarative means they can be inspected, printed, diffed and tested
 * without a browser, which is what lets us ship complete drafts for
 * platforms whose authenticated markup we have not seen yet.
 */

/** Every action the runner knows how to execute. */
export const STEP_ACTIONS = [
  'goto',
  'waitFor',
  'requireUrl',
  'click',
  'fill',
  'press',
  'read',
  'readList',
  'readRecords',
  'extractJson',
  'snapshot',
  'screenshot',
];

/**
 * How much we trust a step's selectors:
 * - `verified`  observed in markup we fetched ourselves (see `evidence`);
 * - `documented` taken from vendor documentation or a public API;
 * - `draft`      inferred from public knowledge, to be confirmed by the
 *                first authenticated run — telemetry will report it.
 */
export const CONFIDENCE_LEVELS = ['verified', 'documented', 'draft'];

const meta = ({
  confidence = 'draft',
  note = null,
  optional = false,
  timeout = null,
  verifiedAt = null,
} = {}) => {
  const out = { confidence };
  if (note) {
    out.note = note;
  }
  if (optional) {
    out.optional = true;
  }
  if (timeout) {
    out.timeout = timeout;
  }
  if (verifiedAt) {
    out.verifiedAt = verifiedAt;
  }
  return out;
};

/** Navigate to a URL. */
export const goto = (url, options = {}) => ({
  action: 'goto',
  url,
  ...meta(options),
});

/** Wait for a selector, optionally tolerating its absence. */
export const waitFor = (selector, options = {}) => ({
  action: 'waitFor',
  selector,
  ...meta({ timeout: 15000, ...options }),
});

/**
 * Assert the browser stayed on an expected URL. Platforms bounce
 * un-authenticated visitors to a login page, so this is how a plan
 * detects "not signed in" instead of silently reading an empty CV.
 */
export const requireUrl = (pattern, options = {}) => ({
  action: 'requireUrl',
  pattern,
  ...meta(options),
});

/** Click an element. */
export const click = (selector, options = {}) => ({
  action: 'click',
  selector,
  ...meta(options),
});

/** Type a CV value, addressed by its canonical path, into a field. */
export const fill = (path, selector, options = {}) => ({
  action: 'fill',
  path,
  selector,
  ...meta(options),
});

/** Press a keyboard key (Enter to submit, Escape to close a modal). */
export const press = (key, options = {}) => ({
  action: 'press',
  key,
  ...meta(options),
});

/** Read one scalar into a canonical CV path. */
export const read = (path, selector, options = {}) => ({
  action: 'read',
  path,
  selector,
  ...meta({ optional: true, ...options }),
});

/** Read an attribute instead of text content. */
export const readAttribute = (path, selector, attribute, options = {}) => ({
  action: 'read',
  path,
  selector,
  attribute,
  ...meta({ optional: true, ...options }),
});

/** Read every match of a selector into a list section such as skills. */
export const readList = (path, selector, options = {}) => ({
  action: 'readList',
  path,
  selector,
  ...meta({ optional: true, ...options }),
});

/**
 * Read a repeated section: one record per `container` match, each
 * field read relative to that container.
 */
export const readRecords = (path, container, fields, options = {}) => ({
  action: 'readRecords',
  path,
  container,
  fields,
  // Most boards render a period as one string ("Jan 2019 — Present"); the
  // runner splits the named field into start/end/current.
  ...(options.durationField ? { durationField: options.durationField } : {}),
  ...meta({ optional: true, ...options }),
});

/**
 * Pull a server-rendered JSON blob out of the page and map it with a
 * named mapper declared by the platform. Far more stable than CSS
 * selectors where a site ships one — Habr Career and VietnamWorks
 * both do.
 */
export const extractJson = (selector, mapper, options = {}) => ({
  action: 'extractJson',
  selector,
  mapper,
  // Canonical sections the mapper fills, so coverage stays checkable
  // even though the mapper itself is opaque to the runner.
  provides: options.provides ?? [],
  ...meta({ optional: true, ...options }),
});

/** Record a markup fingerprint so layout changes surface in telemetry. */
export const snapshot = (name, selector = 'body', options = {}) => ({
  action: 'snapshot',
  name,
  selector,
  ...meta({ confidence: 'verified', ...options }),
});

/** Capture a screenshot for the run's evidence bundle. */
export const screenshot = (name, options = {}) => ({
  action: 'screenshot',
  name,
  ...meta({ confidence: 'verified', ...options }),
});

const SELECTOR_ACTIONS = new Set([
  'waitFor',
  'click',
  'fill',
  'read',
  'readList',
  'extractJson',
  'snapshot',
]);

const PATH_ACTIONS = new Set(['read', 'readList', 'readRecords', 'fill']);

const REQUIRED_KEYS = {
  goto: 'url',
  extractJson: 'mapper',
  readRecords: 'container',
  requireUrl: 'pattern',
  press: 'key',
  screenshot: 'name',
};

const stepProblems = (step, at) => {
  if (!STEP_ACTIONS.includes(step.action)) {
    return [`${at}: unknown action "${step.action}"`];
  }
  const problems = [];
  if (!CONFIDENCE_LEVELS.includes(step.confidence)) {
    problems.push(`${at}: unknown confidence "${step.confidence}"`);
  }
  if (SELECTOR_ACTIONS.has(step.action) && !step.selector) {
    problems.push(`${at}: ${step.action} requires a selector`);
  }
  if (PATH_ACTIONS.has(step.action) && !step.path) {
    problems.push(`${at}: ${step.action} requires a canonical path`);
  }
  const required = REQUIRED_KEYS[step.action];
  if (required && !step[required]) {
    problems.push(`${at}: ${step.action} requires a ${required}`);
  }
  return problems;
};

/**
 * Validate a plan's shape. Called by the platform registry tests so a
 * typo in a descriptor fails CI rather than a live run.
 * @param {object[]} steps
 * @param {string} label
 * @returns {string[]} problems, empty when the plan is well-formed
 */
export const validateSteps = (steps, label = 'plan') => {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [`${label}: expected a non-empty array of steps`];
  }
  return steps.flatMap((step, index) =>
    stepProblems(step, `${label}[${index}]`)
  );
};

/** Steps that still need confirmation against real authenticated markup. */
export const draftSteps = (steps) =>
  steps.filter((step) => step.confidence === 'draft');
