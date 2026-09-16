/**
 * Plan runner (R-V14).
 *
 * Interprets a platform's declarative steps against a browser-commander
 * instance. The runner knows nothing about any particular job board:
 * everything site-specific lives in the descriptors, so adding a
 * platform never means touching this file, and a plan can be replayed
 * against a fake commander in tests without a browser.
 *
 * Every step goes through telemetry, including the ones that miss, so
 * the first authenticated run against a platform whose selectors are
 * still drafts produces a log that says exactly which selector to fix.
 */

import {
  BOOLEAN_FIELDS,
  LIST_SECTIONS,
  MAP_SECTIONS,
  RECORD_SECTIONS,
  emptyCv,
  normalizeCv,
} from './model.js';
import { clean, parseDuration, parseLanguage } from './platforms/parse.js';
import { createMemorySink, createTelemetryRun } from './telemetry.js';

const TRUE_WORDS = /^(true|yes|да|có|1)$/i;

/** Split "a, b" into selector candidates, ignoring commas inside quotes. */
export const selectorCandidates = (selector) => {
  if (typeof selector !== 'string') {
    return [];
  }
  const parts = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const char of selector) {
    if (quote) {
      quote = char === quote ? '' : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(' || char === '[') {
      depth += 1;
    } else if (char === ')' || char === ']') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
};

/** Resolve `{{a.b}}` placeholders from the run's variables. */
export const resolveTemplate = (input, vars) => {
  if (typeof input !== 'string') {
    return input;
  }
  return input.replace(/\{\{([\w.-]+)\}\}/g, (match, path) => {
    const value = path
      .split('.')
      .reduce(
        (node, key) => (node === null || node === undefined ? node : node[key]),
        vars
      );
    return value === undefined || value === null ? match : String(value);
  });
};

/** Does the string still contain an unresolved placeholder? */
export const hasUnresolved = (value) =>
  typeof value === 'string' && /\{\{[\w.-]+\}\}/.test(value);

const toBoolean = (value) =>
  typeof value === 'boolean' ? value : TRUE_WORDS.test(String(value).trim());

const mergeList = (existing, values) => {
  const seen = new Set(existing.map((entry) => entry.toLowerCase()));
  const merged = [...existing];
  for (const value of values.map(clean).filter(Boolean)) {
    if (!seen.has(value.toLowerCase())) {
      seen.add(value.toLowerCase());
      merged.push(value);
    }
  }
  return merged;
};

const recordFromRaw = (section, raw, durationField) => {
  const spec = RECORD_SECTIONS[section];
  const record = {};
  for (const field of spec.fields) {
    if (raw[field] !== undefined) {
      record[field] = BOOLEAN_FIELDS.has(field)
        ? toBoolean(raw[field])
        : clean(raw[field]);
    }
  }
  if (durationField && raw[durationField]) {
    const period = parseDuration(raw[durationField]);
    record.start = period.start;
    record.end = period.end;
    record.current = period.current;
  }
  return record;
};

/**
 * `experience[].title`: one field of one repeated record. Plans that
 * edit a single record at a time — Naukri's employment drawer, for
 * instance — address the first row, the one every board shows on top.
 */
const RECORD_FIELD = /^([a-z]+)\[\]\.([a-zA-Z]+)$/;

const recordFieldOf = (path) => {
  const match = RECORD_FIELD.exec(path);
  if (!match) {
    return null;
  }
  const [, section, field] = match;
  return RECORD_SECTIONS[section]?.fields.includes(field)
    ? { section, field }
    : null;
};

/**
 * Write a value into the canonical CV at `path`. Lists merge, records
 * replace, scalars coerce — the same rules the model's normaliser uses.
 */
export const assignPath = (cv, path, value, { durationField = null } = {}) => {
  const indexed = recordFieldOf(path);
  if (indexed) {
    const rows = cv[indexed.section]?.length ? cv[indexed.section] : [{}];
    rows[0] = {
      ...rows[0],
      [indexed.field]: BOOLEAN_FIELDS.has(indexed.field)
        ? toBoolean(value)
        : clean(value),
    };
    cv[indexed.section] = rows;
    return cv;
  }
  const [section, field] = path.split('.');
  if (MAP_SECTIONS[section] && field) {
    cv[section][field] = BOOLEAN_FIELDS.has(field)
      ? toBoolean(value)
      : clean(value);
    return cv;
  }
  if (LIST_SECTIONS[section]) {
    cv[section] = mergeList(cv[section] ?? [], [].concat(value));
    return cv;
  }
  if (RECORD_SECTIONS[section]) {
    const rows = [].concat(value).filter(Boolean);
    cv[section] =
      section === 'languages' && rows.every((row) => typeof row === 'string')
        ? rows.map(parseLanguage)
        : rows.map((row) =>
            typeof row === 'string'
              ? parseLanguage(row)
              : recordFromRaw(section, row, durationField)
          );
    return cv;
  }
  throw new Error(`Cannot assign unknown CV path "${path}"`);
};

/** Read a value out of a CV for a `fill` step. */
export const valueAtPath = (cv, path) => {
  const indexed = recordFieldOf(path);
  if (indexed) {
    return cv?.[indexed.section]?.[0]?.[indexed.field] ?? '';
  }
  const [section, field] = path.split('.');
  if (MAP_SECTIONS[section] && field) {
    return cv?.[section]?.[field] ?? '';
  }
  return cv?.[section] ?? null;
};

// --- page-side extractors (serialised into the browser) -------------

const pageTexts = ({ selector }) =>
  Array.from(document.querySelectorAll(selector))
    .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 0);

const pageRecords = ({ container, fields }) =>
  Array.from(document.querySelectorAll(container)).map((node) => {
    const record = {};
    for (const [field, selector] of Object.entries(fields)) {
      const found = node.querySelector(selector);
      record[field] = found
        ? (found.textContent ?? '').replace(/\s+/g, ' ').trim()
        : '';
    }
    return record;
  });

const pageHtml = ({ selector }) => {
  const node = document.querySelector(selector);
  return node ? node.outerHTML : '';
};

// --- step handlers --------------------------------------------------

const missed = (reason) => ({ missed: true, reason });

/**
 * Playwright resolves a locator strictly: a selector matching two nodes
 * throws instead of picking one, and real profile pages repeat their
 * markup — Naukri renders one `.card.profile-container` per section.
 * Steps that address a single element therefore narrow to the first
 * match, which is what a person reading the page would do, and the
 * narrowing stays visible in telemetry because it is part of the
 * selector we report.
 */
const firstMatch = (selector) => `:nth-match(${selector}, 1)`;

/**
 * First selector candidate that matches, reporting any fallback used.
 *
 * @param {object} ctx run context
 * @param {string} selector raw selector from the step, possibly a
 *   comma-separated candidate list
 * @param {object} report telemetry reporter for the step
 * @param {{unique?: boolean}} [options] `unique` narrows a selector
 *   that matched more than once to its first match
 */
const pickSelector = async (ctx, selector, report, { unique = false } = {}) => {
  const candidates = selectorCandidates(resolveTemplate(selector, ctx.vars));
  for (const [index, candidate] of candidates.entries()) {
    const count = await ctx.commander.count({ selector: candidate });
    if (count > 0) {
      if (index > 0) {
        await report.fallback(candidates[0], candidate);
      }
      return unique && count > 1 ? firstMatch(candidate) : candidate;
    }
  }
  return null;
};

/**
 * Elements that never render. A `<script type="application/json">` blob
 * — Habr Career and VietnamWorks both publish their profile state in
 * one — is attached but permanently invisible, so waiting for it to
 * become *visible* could only ever time out.
 */
const NEVER_VISIBLE = /(^|[\s>+~,])(script|template|meta|link|style)\b/i;

const isTimeout = (error) =>
  error?.name === 'TimeoutError' ||
  /timeout\s+\d+ms exceeded/i.test(error?.message ?? '');

const isStrictViolation = (error) =>
  /strict mode violation/i.test(error?.message ?? '');

const handlers = {
  async goto(step, ctx) {
    const url = resolveTemplate(step.url, ctx.vars);
    if (hasUnresolved(url)) {
      return missed(`unresolved url ${url}`);
    }
    await ctx.commander.goto({
      url,
      waitUntil: 'domcontentloaded',
      ...(step.timeout ? { timeout: step.timeout } : {}),
    });
    ctx.vars.url = await ctx.commander.getUrl();
    return { telemetry: { url: ctx.vars.url } };
  },

  async waitFor(step, ctx) {
    const selector = resolveTemplate(step.selector, ctx.vars);
    const timeout = step.timeout ?? 15000;
    let found;
    try {
      found = await ctx.commander.waitForSelector({
        selector,
        timeout,
        visible: !NEVER_VISIBLE.test(selector),
        throwOnNavigation: false,
      });
    } catch (error) {
      if (isStrictViolation(error)) {
        // Several nodes match, so the thing the plan waited for is on
        // the page — twice over. Steps that follow address the first.
        return { telemetry: { selector, matches: 'multiple' } };
      }
      if (!isTimeout(error)) {
        throw error;
      }
      // "Still not there" is drift, not a crash: reporting it as a miss
      // keeps the run report — and every event leading up to it — intact
      // instead of unwinding the plan with a browser stack trace.
      return missed(`timeout after ${timeout}ms ${selector}`);
    }
    return found ? { telemetry: { selector } } : missed(`no match ${selector}`);
  },

  async requireUrl(step, ctx) {
    const current = (await ctx.commander.getUrl()) ?? '';
    ctx.vars.url = current;
    if (new RegExp(step.pattern).test(current)) {
      return { telemetry: { url: current } };
    }
    const error = new Error(
      `${ctx.platform.id}: expected URL matching /${step.pattern}/, got ${current}`
    );
    // The overwhelmingly common cause: the session expired.
    error.code = /log[-_]?in|sign[-_]?in|auth|account\/login/i.test(current)
      ? 'login-required'
      : 'unexpected-url';
    throw error;
  },

  async click(step, ctx, report) {
    const selector = await pickSelector(ctx, step.selector, report, {
      unique: true,
    });
    if (!selector) {
      return missed(`no match ${step.selector}`);
    }
    const clicked = await ctx.commander.clickButton({
      selector,
      scrollIntoView: true,
      waitAfterClick: 500,
    });
    return clicked === false
      ? missed(`click failed ${selector}`)
      : { telemetry: { selector } };
  },

  async fill(step, ctx, report) {
    const text = clean(valueAtPath(ctx.target, step.path));
    if (!text) {
      return { skipped: true, reason: `no value for ${step.path}` };
    }
    const selector = await pickSelector(ctx, step.selector, report, {
      unique: true,
    });
    if (!selector) {
      return missed(`no match ${step.selector}`);
    }
    const result = await ctx.commander.fillTextArea({
      selector,
      text,
      checkEmpty: false,
      simulateTyping: true,
      verify: true,
    });
    await report.write(step.path, text);
    if (!result?.filled) {
      return missed(`fill failed ${selector}`);
    }
    if (result.verified === false) {
      ctx.warnings.push(`${step.path}: written but not verified`);
    }
    return { telemetry: { selector, verified: Boolean(result.verified) } };
  },

  async press(step, ctx) {
    await ctx.commander.pressKey({ key: step.key });
    return { telemetry: { key: step.key } };
  },

  async read(step, ctx, report) {
    const selector = await pickSelector(ctx, step.selector, report, {
      unique: true,
    });
    if (!selector) {
      return missed(`no match ${step.selector}`);
    }
    const value = step.attribute
      ? await ctx.commander.getAttribute({
          selector,
          attribute: step.attribute,
        })
      : await ctx.commander.textContent({ selector });
    if (!clean(value)) {
      return missed(`empty ${selector}`);
    }
    assignPath(ctx.cv, step.path, value);
    await report.read(step.path, value);
    return { telemetry: { selector } };
  },

  async readList(step, ctx, report) {
    const selector = await pickSelector(ctx, step.selector, report);
    if (!selector) {
      return missed(`no match ${step.selector}`);
    }
    const values = await ctx.commander.evaluate({
      fn: pageTexts,
      args: [{ selector }],
    });
    if (!Array.isArray(values) || values.length === 0) {
      return missed(`empty list ${selector}`);
    }
    assignPath(ctx.cv, step.path, values);
    await report.read(step.path, values);
    return { telemetry: { selector, count: values.length } };
  },

  async readRecords(step, ctx, report) {
    const container = resolveTemplate(step.container, ctx.vars);
    const rows = await ctx.commander.evaluate({
      fn: pageRecords,
      args: [{ container, fields: step.fields }],
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      return missed(`no records ${container}`);
    }
    assignPath(ctx.cv, step.path, rows, {
      durationField: step.durationField ?? null,
    });
    await report.read(step.path, rows);
    return { telemetry: { container, count: rows.length } };
  },

  async extractJson(step, ctx, report) {
    const selector = await pickSelector(ctx, step.selector, report, {
      unique: true,
    });
    if (!selector) {
      return missed(`no match ${step.selector}`);
    }
    const raw = await ctx.commander.textContent({ selector });
    if (!clean(raw)) {
      return missed(`empty json ${selector}`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return missed(`invalid json at ${selector}: ${error.message}`);
    }
    const mapper = ctx.platform.mappers[step.mapper];
    const mapped = mapper(parsed);
    if ((step.provides ?? []).length > 0) {
      // A CV mapper: merge its sections over whatever the DOM produced.
      mergeCv(ctx.cv, mapped, step.provides);
      await report.read(step.mapper, step.provides);
    } else {
      // A helper mapper (edit URLs, ids): exposed to later templates.
      ctx.vars[step.mapper] = mapped;
    }
    return { telemetry: { selector, mapper: step.mapper } };
  },

  async snapshot(step, ctx) {
    const selector = resolveTemplate(step.selector, ctx.vars);
    const html = await ctx.commander.evaluate({
      fn: pageHtml,
      args: [{ selector }],
    });
    if (!html) {
      return missed(`no markup at ${selector}`);
    }
    const { drift } = await ctx.telemetry.snapshot(step.name, html, {
      selector,
      url: ctx.vars.url ?? null,
    });
    if (drift.changed) {
      ctx.warnings.push(
        `markup changed at ${step.name}: ${drift.reasons.join('; ')}`
      );
    }
    return { telemetry: { selector, changed: drift.changed } };
  },

  async screenshot(step, ctx) {
    const page = ctx.commander.page;
    if (!page?.screenshot) {
      return { skipped: true, reason: 'engine has no screenshot support' };
    }
    const buffer = await page.screenshot();
    await ctx.telemetry.screenshot(step.name, buffer);
    return { telemetry: { name: step.name } };
  },
};

/** Merge only the named sections of `patch` into `cv`. */
export const mergeCv = (cv, patch, sections) => {
  for (const section of sections) {
    const value = patch?.[section];
    if (value === undefined || value === null) {
      continue;
    }
    if (MAP_SECTIONS[section]) {
      for (const [field, entry] of Object.entries(value)) {
        if (entry !== '' && entry !== null && entry !== undefined) {
          cv[section][field] = entry;
        }
      }
    } else if (Array.isArray(value) && value.length > 0) {
      cv[section] = value;
    }
  }
  return cv;
};

const runStep = async (step, index, ctx) => {
  const handler = handlers[step.action];
  if (!handler) {
    throw new Error(`${ctx.platform.id}: unknown step action "${step.action}"`);
  }
  const outcome = await ctx.telemetry.step(step, index, async (report) => {
    const result = await handler(step, ctx, report);
    if (result?.missed) {
      await report.miss(result.reason);
    }
    return result;
  });
  if (outcome?.skipped) {
    await ctx.telemetry.skip(step, index, outcome.reason);
    return outcome;
  }
  if (outcome?.missed) {
    ctx.warnings.push(
      `${step.action} ${step.path ?? step.name ?? ''}: ${outcome.reason}`.trim()
    );
    if (!step.optional) {
      const error = new Error(
        `${ctx.platform.id}: required step ${index} (${step.action}) missed — ${outcome.reason}`
      );
      error.code = 'step-missed';
      throw error;
    }
  }
  return outcome;
};

const runSteps = async (steps, ctx) => {
  for (const [index, step] of steps.entries()) {
    await runStep(step, index, ctx);
  }
  return ctx;
};

/**
 * Create a runner bound to one platform and one browser page.
 *
 * @param {object} options
 * @param {object} options.platform descriptor from the registry
 * @param {object} options.commander browser-commander instance
 * @param {object} [options.telemetry] run created by `createTelemetryRun`
 * @param {object} [options.vars] template variables (`login`, `resumeId`, …)
 */
export const createCvRunner = ({
  platform,
  commander,
  telemetry = null,
  vars = {},
  sink = null,
  baseline = {},
  artifactDir = null,
}) => {
  const makeTelemetry = (mode) =>
    telemetry ??
    createTelemetryRun({
      platform: platform.id,
      mode,
      sink: sink ?? createMemorySink(),
      baseline,
      artifactDir,
    });

  const makeContext = (mode, target) => ({
    platform,
    commander,
    telemetry: makeTelemetry(mode),
    cv: emptyCv(),
    target,
    vars: { ...vars },
    warnings: [],
  });

  return {
    platform,

    /** Execute the read plan and return the captured CV plus its report. */
    async read() {
      const ctx = makeContext('read', null);
      await ctx.telemetry.start({ plan: 'read', steps: platform.read.length });
      try {
        await runSteps(platform.read, ctx);
      } finally {
        ctx.report = await ctx.telemetry.finish({
          warnings: ctx.warnings,
        });
      }
      return {
        platform: platform.id,
        cv: normalizeCv(ctx.cv),
        url: ctx.vars.url ?? null,
        warnings: ctx.warnings,
        report: ctx.report,
      };
    },

    /**
     * Run the update groups whose guarded paths the caller asked for.
     * @param {object} cv canonical CV to write
     * @param {object} [options] `{ paths, groups }` filters
     */
    async update(cv, { paths = null, groups = null } = {}) {
      const target = normalizeCv(cv);
      const ctx = makeContext('update', target);
      const selected = platform.update.filter((group) => {
        if (groups) {
          return groups.includes(group.id);
        }
        if (paths) {
          return group.paths.some((guarded) =>
            paths.some(
              (wanted) => wanted === guarded || wanted.startsWith(`${guarded}.`)
            )
          );
        }
        return true;
      });
      await ctx.telemetry.start({
        plan: 'update',
        groups: selected.map((group) => group.id),
      });
      const applied = [];
      try {
        for (const group of selected) {
          await runSteps(group.steps, ctx);
          applied.push(group.id);
        }
      } finally {
        ctx.report = await ctx.telemetry.finish({
          warnings: ctx.warnings,
          applied,
        });
      }
      return {
        platform: platform.id,
        applied,
        warnings: ctx.warnings,
        report: ctx.report,
      };
    },
  };
};

const describeStep = (step, index) => ({
  index,
  action: step.action,
  confidence: step.confidence,
  optional: Boolean(step.optional),
  target: step.url ?? step.selector ?? step.container ?? step.name ?? step.key,
  path: step.path ?? null,
  note: step.note ?? null,
});

/**
 * Describe a plan without touching a browser — what `cv plan` prints
 * and what a reviewer reads to check a draft against a real site.
 * @param {object} platform
 */
export const dryRunPlan = (platform) => ({
  platform: platform.id,
  label: platform.label,
  urls: platform.urls,
  auth: platform.auth,
  markupAccess: platform.markupAccess ?? 'browser',
  confidence: platform.confidence,
  draftCount: platform.draftCount,
  read: platform.read.map(describeStep),
  update: platform.update.map((group) => ({
    id: group.id,
    paths: group.paths,
    optional: Boolean(group.optional),
    note: group.note ?? null,
    steps: group.steps.map(describeStep),
  })),
  evidence: platform.evidence,
  notes: platform.notes,
});
