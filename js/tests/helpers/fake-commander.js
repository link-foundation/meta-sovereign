/**
 * Fake browser-commander for plan-runner tests (issue #29).
 *
 * Implements the subset of the browser-commander 0.8 API the runner
 * uses, backed by a declarative page fixture instead of a browser, and
 * a minimal DOM stub so the runner's real page-side extractors run
 * unmodified. A real-browser counterpart lives in
 * `js/tests/e2e-cv-browser.mjs`.
 */

import { selectorCandidates } from '../../src/cv/runner.js';

const makeNode = (entry) => ({
  textContent: entry.text ?? '',
  outerHTML: entry.html ?? `<div>${entry.text ?? ''}</div>`,
  getAttribute: (attribute) => entry.attrs?.[attribute] ?? null,
  querySelector: (selector) =>
    entry.fields && entry.fields[selector] !== undefined
      ? makeNode({ text: entry.fields[selector] })
      : null,
});

/**
 * A browser matches every branch of a selector list (`a, b`), so the
 * fixture lookup unions the candidates the same way — otherwise tests
 * would have to mirror each plan's exact fallback string.
 */
const entriesFor = (page, selector) =>
  selectorCandidates(selector).flatMap(
    (candidate) => page.nodes?.[candidate] ?? []
  );

const withDocument = async (page, fn, arg) => {
  const previous = globalThis.document;
  globalThis.document = {
    querySelectorAll: (selector) => entriesFor(page, selector).map(makeNode),
    querySelector: (selector) => {
      const [first] = entriesFor(page, selector);
      return first ? makeNode(first) : null;
    },
  };
  try {
    return await fn(arg);
  } finally {
    globalThis.document = previous;
  }
};

/**
 * @param {object} options
 * @param {Record<string, object>} options.pages url → page fixture
 * @param {string} options.url starting url
 */
export const createFakeCommander = ({ pages, url = Object.keys(pages)[0] }) => {
  const calls = { goto: [], click: [], fill: [], press: [], screenshot: 0 };
  let current = url;
  const page = () => pages[current] ?? { nodes: {} };
  const nodes = (selector) => entriesFor(page(), selector);

  return {
    calls,
    engine: 'fake',
    page: {
      async screenshot() {
        calls.screenshot += 1;
        return Buffer.from('png');
      },
    },
    async goto({ url: target }) {
      calls.goto.push(target);
      current = pages[target]?.redirectTo ?? target;
      return true;
    },
    async getUrl() {
      return current;
    },
    async count({ selector }) {
      return nodes(selector).length;
    },
    async waitForSelector({ selector }) {
      return nodes(selector).length > 0;
    },
    async textContent({ selector }) {
      return nodes(selector)[0]?.text ?? '';
    },
    async getAttribute({ selector, attribute }) {
      return nodes(selector)[0]?.attrs?.[attribute] ?? null;
    },
    async clickButton({ selector }) {
      calls.click.push(selector);
      const target = page().clicks?.[selector];
      if (target) {
        current = target;
      }
      return true;
    },
    async fillTextArea({ selector, text }) {
      calls.fill.push({ selector, text });
      if (page().fillFails?.includes(selector)) {
        return { filled: false, verified: false, skipped: false };
      }
      return {
        filled: true,
        verified: !page().unverifiedFills?.includes(selector),
        skipped: false,
        actualValue: text,
      };
    },
    async pressKey({ key }) {
      calls.press.push(key);
      return true;
    },
    async evaluate({ fn, args = [] }) {
      return withDocument(page(), fn, args[0]);
    },
    async destroy() {},
  };
};
