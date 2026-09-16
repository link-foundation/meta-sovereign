/**
 * Markup fixtures generated from a CV plan (issue #29).
 *
 * The plans in `js/src/cv/platforms` are declarative, so the markup a
 * plan expects can be derived from the plan itself: every selector is
 * turned back into the smallest DOM that would satisfy it. That gives
 * a real browser something to read without touching linkedin.com, and
 * it means a plan and its fixture can never drift apart — the fixture
 * *is* the plan, read backwards.
 *
 * The generated pages drive `js/tests/e2e-cv-browser.mjs`, where they
 * are served through Playwright request interception at the platform's
 * own URLs, so `requireUrl` checks stay meaningful.
 */

import { resolveTemplate, selectorCandidates } from '../../src/cv/runner.js';

/** Void elements that must not be given children. */
const VOID_TAGS = new Set(['input', 'img', 'br', 'hr']);

/**
 * Elements whose content an HTML parser hands back verbatim: escaping
 * a JSON payload inside `<script type="application/json">` would make
 * `JSON.parse` choke on `&quot;`, because entities are never decoded
 * there. `<` is escaped JSON-side instead, so no `</script>` can end
 * the element early.
 */
const RAW_TEXT_TAGS = new Set(['script', 'style']);

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attributeFrom = (body) => {
  // `name`, `name="v"`, `name*="v"`, `name^='v'`, `name=v`.
  const match = /^([\w:-]+)\s*(?:([~^|$*]?)=\s*(.+))?$/.exec(body.trim());
  if (!match) {
    throw new Error(`unsupported attribute selector "[${body}]"`);
  }
  const raw = (match[3] ?? '').trim();
  const value = /^["']/.test(raw) ? raw.slice(1, -1) : raw;
  return { name: match[1], value };
};

/**
 * Split one compound selector (`div#a.b[c="d"]`) into its parts.
 * @param {string} token
 * @returns {{tag: string|null, id: string|null, classes: string[], attrs: object}}
 */
export const parseSimpleSelector = (token) => {
  const out = { tag: null, id: null, classes: [], attrs: {} };
  let rest = token.trim();
  const tag = /^[a-zA-Z][\w-]*/.exec(rest);
  if (tag) {
    out.tag = tag[0];
    rest = rest.slice(tag[0].length);
  }
  while (rest.length > 0) {
    const head = rest[0];
    if (head === '#' || head === '.') {
      const match = /^[#.]([\w-]+)/.exec(rest);
      if (!match) {
        throw new Error(`unsupported selector "${token}"`);
      }
      if (head === '#') {
        out.id = match[1];
      } else {
        out.classes.push(match[1]);
      }
      rest = rest.slice(match[0].length);
      continue;
    }
    if (head === '[') {
      const end = rest.indexOf(']');
      if (end < 0) {
        throw new Error(`unterminated attribute in "${token}"`);
      }
      const { name, value } = attributeFrom(rest.slice(1, end));
      // `[class*="Module_part"]`: a class, not a stray attribute.
      if (name === 'class') {
        out.classes.push(value);
      } else {
        out.attrs[name] = value;
      }
      rest = rest.slice(end + 1);
      continue;
    }
    throw new Error(`unsupported selector syntax "${token}"`);
  }
  return out;
};

/**
 * Render one parsed selector as an element.
 * @param {object} parsed from {@link parseSimpleSelector}
 * @param {{inner?: string, text?: string|null, defaultTag?: string}} [options]
 */
export const renderSimpleSelector = (parsed, options = {}) => {
  const { inner = '', text = null, defaultTag = 'div' } = options;
  const tag = parsed.tag ?? defaultTag;
  const attrs = { ...parsed.attrs };
  if (parsed.id) {
    attrs.id = parsed.id;
  }
  if (parsed.classes.length > 0) {
    attrs.class = [attrs.class, ...parsed.classes].filter(Boolean).join(' ');
  }
  if (tag === 'input' && text !== null) {
    attrs.value = text;
  }
  const rendered = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  if (VOID_TAGS.has(tag)) {
    return `<${tag}${rendered}>`;
  }
  const escaped = RAW_TEXT_TAGS.has(tag) ? text : escapeHtml(text);
  const body = text === null ? inner : `${escaped}${inner}`;
  return `<${tag}${rendered}>${body}</${tag}>`;
};

/**
 * Split a candidate into element tokens and combinators, left to
 * right. Whitespace and combinators inside `[attr="a b"]` or a quoted
 * value are part of the token, not separators.
 */
export const tokenizeCandidate = (candidate) => {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = '';
  const flush = () => {
    if (current.trim()) {
      parts.push({ type: 'element', token: current.trim() });
    }
    current = '';
  };
  for (const char of candidate.trim()) {
    if (quote) {
      quote = char === quote ? '' : quote;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '[' || char === '(') {
      depth += 1;
    } else if (char === ']' || char === ')') {
      depth -= 1;
    } else if (depth === 0 && /\s/.test(char)) {
      flush();
      continue;
    } else if (depth === 0 && ['>', '+', '~'].includes(char)) {
      flush();
      parts.push({ type: 'combinator', value: char });
      continue;
    }
    current += char;
  }
  flush();
  return parts;
};

/**
 * Build the smallest DOM fragment that satisfies a selector.
 *
 * Only the first candidate of a `a, b` selector is realised: that is
 * the selector the plan prefers, and the runner reports a fallback in
 * telemetry whenever it has to use a later one.
 *
 * @param {string} selector CSS selector from a plan step
 * @param {{text?: string|null, inner?: string, defaultTag?: string}} [options]
 * @returns {string} HTML
 */
export const htmlForSelector = (selector, options = {}) => {
  const [candidate] = selectorCandidates(selector);
  if (!candidate) {
    throw new Error(`empty selector "${selector}"`);
  }
  const parts = tokenizeCandidate(candidate);
  let html = options.inner ?? '';
  let innermost = true;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type === 'combinator') {
      if (part.value === '>') {
        continue;
      }
      // `a ~ b` / `a + b`: emit the sibling *before* the subtree.
      const sibling = parts[index - 1];
      html = `${renderSimpleSelector(parseSimpleSelector(sibling.token))}${html}`;
      index -= 1;
      continue;
    }
    html = renderSimpleSelector(parseSimpleSelector(part.token), {
      inner: html,
      text: innermost ? (options.text ?? null) : null,
      defaultTag: innermost ? (options.defaultTag ?? 'div') : 'div',
    });
    innermost = false;
  }
  return html;
};

/** Deterministic fixture text for a canonical path. */
export const fixtureText = (platformId, path, suffix = null) =>
  suffix === null ? `${platformId} ${path}` : `${platformId} ${path} ${suffix}`;

/** How many entries list/record fixtures render. */
export const FIXTURE_ROWS = 2;

const recordsHtml = (platformId, step) => {
  const rows = [];
  for (let row = 1; row <= FIXTURE_ROWS; row += 1) {
    const fields = Object.entries(step.fields ?? {})
      .map(([field, selector]) =>
        htmlForSelector(selector, {
          text:
            field === step.durationField
              ? `Jan 200${row} - Dec 200${row}`
              : fixtureText(platformId, `${step.path}.${field}`, row),
        })
      )
      .join('');
    rows.push(htmlForSelector(step.container, { inner: fields }));
  }
  return rows.join('');
};

const listHtml = (platformId, step) => {
  const items = [];
  for (let row = 1; row <= FIXTURE_ROWS; row += 1) {
    items.push(
      htmlForSelector(step.selector, {
        text: fixtureText(platformId, step.path, row),
      })
    );
  }
  return items.join('');
};

const scalarHtml = (platformId, step) => {
  const text = fixtureText(platformId, step.path);
  if (step.attribute) {
    return htmlForSelector(`${step.selector.split(',')[0]}`, {
      text: null,
      inner: '',
    }).replace('>', ` ${step.attribute}="${escapeHtml(text)}">`);
  }
  return htmlForSelector(step.selector, { text });
};

/** `<script type="application/json">` holding a mapper's payload. */
const jsonHtml = (step, json) => {
  const payload = json?.[step.mapper];
  if (payload === undefined) {
    // No payload: the blob is absent, which is what a signed-out visit
    // looks like. `extractJson` is optional, so the run reports a miss
    // and falls back to the plan's DOM selectors.
    return null;
  }
  return htmlForSelector(step.selector, {
    defaultTag: 'script',
    text: JSON.stringify(payload).replace(/</g, '\\u003c'),
  });
};

/**
 * Markup one plan step needs, or `null` when a step touches no DOM
 * (`goto`, `press`, `screenshot`) or has nothing to render — a
 * snapshot container wraps the page (see {@link fixturePagesFor}), an
 * `extractJson` step without a payload leaves the blob out entirely.
 *
 * @param {string} platformId
 * @param {object} step
 * @param {{json?: object}} [options] payloads by mapper name
 * @returns {string|null}
 */
export const htmlForStep = (platformId, step, options = {}) => {
  switch (step.action) {
    case 'waitFor':
      return htmlForSelector(step.selector);
    case 'click':
      return htmlForSelector(step.selector, { defaultTag: 'button' });
    case 'fill':
      return htmlForSelector(step.selector, {
        defaultTag: 'textarea',
        text: '',
      });
    case 'read':
      return scalarHtml(platformId, step);
    case 'readList':
      return listHtml(platformId, step);
    case 'readRecords':
      return recordsHtml(platformId, step);
    case 'extractJson':
      return jsonHtml(step, options.json);
    default:
      return null;
  }
};

// A generated element carries no text of its own, and an empty block
// is zero-sized — which Playwright (and therefore browser-commander's
// `waitForSelector`) treats as hidden. Giving every node a minimum box
// makes the fixture behave like a rendered page. The rule lives in
// `<head>` so it never lands inside a `body` snapshot's fingerprint.
const VISIBILITY_CSS = '*{min-width:4px;min-height:4px;display:block}';

// Plans click real submit buttons (`button[type="submit"]`). A live
// site answers with a new page; a fixture has nothing to answer with,
// and the navigation would tear the DOM out from under the click
// verification. Staying on the page keeps the plan's own steps — not
// the fixture's plumbing — the thing under test.
const STAY_PUT_JS =
  "addEventListener('submit',(e)=>e.preventDefault(),true);" +
  "addEventListener('click',(e)=>{" +
  "if(e.target.closest&&e.target.closest('a[href]'))e.preventDefault();" +
  '},true);';

const page = (title, body) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<title>${escapeHtml(title)}</title><style>${VISIBILITY_CSS}</style>` +
  `<script>${STAY_PUT_JS}</script></head><body>${body}</body></html>`;

/** Steps grouped by the URL the preceding `goto` navigated to. */
const stepsByUrl = (steps, fallbackUrl) => {
  const byUrl = new Map();
  let current = fallbackUrl;
  for (const step of steps) {
    if (step.action === 'goto') {
      current = step.url;
      if (!byUrl.has(current)) {
        byUrl.set(current, []);
      }
      continue;
    }
    if (!byUrl.has(current)) {
      byUrl.set(current, []);
    }
    byUrl.get(current).push(step);
  }
  return byUrl;
};

/**
 * How much markup a step needs: a `read` carries text, a `fill` needs
 * a field, a `click` a button, a `waitFor` only a container. When two
 * steps of the same page share a selector — hh.ru waits for the same
 * `[data-qa]` node it then reads — the richest one wins, because a
 * real page has one element there, not two.
 */
const STEP_RANK = {
  read: 4,
  readList: 4,
  readRecords: 4,
  extractJson: 4,
  fill: 3,
  click: 2,
  waitFor: 1,
};

/** Rank of a snapshot container: it realises its own selector. */
const CONTAINER_RANK = 2.5;

const selectorKeyOf = (step, vars) => {
  const selector =
    step.action === 'readRecords' ? step.container : step.selector;
  if (typeof selector !== 'string') {
    return null;
  }
  return selectorCandidates(resolveTemplate(selector, vars))[0] ?? null;
};

/**
 * One element per distinct selector — see {@link STEP_RANK}. Steps that
 * render nothing never claim a selector, so a `waitFor` still gets its
 * element when the `extractJson` sharing its selector has no payload.
 */
const dedupeSteps = (steps, containers, vars, render) => {
  const best = new Map();
  for (const step of steps) {
    const key = selectorKeyOf(step, vars);
    const html = render(step);
    if (key === null || html === null) {
      continue;
    }
    const rank = STEP_RANK[step.action] ?? 0;
    if ((best.get(key)?.rank ?? -1) < rank) {
      best.set(key, { html, rank });
    }
  }
  for (const key of containers) {
    if ((best.get(key)?.rank ?? 0) < CONTAINER_RANK) {
      best.delete(key);
    }
  }
  return [...best.values()].map((entry) => entry.html);
};

/**
 * Tags an HTML parser refuses to nest inside themselves: a `<form>`
 * inside a `<form>` is dropped outright, and the page would then be
 * missing the very node a plan waits for. Fragments that would break
 * that rule are emitted next to the wrapper instead of inside it.
 */
const UNNESTABLE = new Set(['form', 'button', 'a', 'p']);

const containerTagsOf = (containers) =>
  containers
    .map((key) => {
      const last = tokenizeCandidate(key).at(-1);
      return last ? parseSimpleSelector(last.token).tag : null;
    })
    .filter((tag) => tag && UNNESTABLE.has(tag));

const nestable = (html, tags) => !tags.some((tag) => html.includes(`<${tag}`));

const containerKeysOf = (steps, vars) => [
  ...new Set(
    steps
      .filter((step) => step.action === 'snapshot' && step.selector !== 'body')
      .map((step) => selectorKeyOf(step, vars))
  ),
];

/**
 * Every page a plan visits, rendered from the plan's own selectors.
 *
 * The page body is nested inside the plan's own snapshot containers
 * (`snapshot('profile', 'main')` → everything lives inside `<main>`),
 * for two reasons: it is what a real profile page looks like, and it
 * makes the markup fingerprint react to the fields around it, so a
 * removed selector shows up as drift instead of an unchanged wrapper.
 * A `body` snapshot needs no wrapper — the page is one.
 *
 * @param {object} platform descriptor from the CV registry
 * @param {object} [options]
 * @param {'read'|'update'} [options.plan] which plan to realise
 * @param {string[]} [options.groups] update groups to include
 * @param {object} [options.vars] template variables, so the URL keys
 *   match the URLs the runner will actually navigate to
 * @param {string[]} [options.omit] canonical paths to leave out, which
 *   is how a test simulates a platform changing its markup
 * @param {object} [options.json] payloads by mapper name, rendered into
 *   the `extractJson` blob the plan reads them from
 * @returns {Map<string, string>} URL → HTML
 */
export const fixturePagesFor = (platform, options = {}) => {
  const {
    plan = 'read',
    groups = null,
    vars = {},
    omit = [],
    json = {},
  } = options;
  const steps =
    plan === 'read'
      ? platform.read
      : platform.update
          .filter((group) => !groups || groups.includes(group.id))
          .flatMap((group) => group.steps);
  const pages = new Map();
  for (const [url, urlSteps] of stepsByUrl(steps, platform.urls.profile)) {
    const kept = urlSteps.filter((step) => !omit.includes(step.path));
    const containers = containerKeysOf(kept, vars);
    const tags = containerTagsOf(containers);
    const fragments = dedupeSteps(kept, containers, vars, (step) =>
      htmlForStep(platform.id, step, { json })
    );
    let body = fragments.filter((html) => nestable(html, tags)).join('\n');
    // Outermost first in the plan, so wrap from the inside out.
    for (let index = containers.length - 1; index >= 0; index -= 1) {
      body = htmlForSelector(containers[index], { inner: body });
    }
    body = [body, ...fragments.filter((html) => !nestable(html, tags))].join(
      '\n'
    );
    pages.set(
      resolveTemplate(url, vars),
      page(`${platform.label} fixture`, body)
    );
  }
  return pages;
};
