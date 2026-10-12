// PR #34 review (2026-10-12): screenshot every SPA view at desktop,
// tablet and phone widths in light and dark, and report layout defects
// a reviewer would otherwise have to spot by eye:
//   * overflow  — an element wider than the viewport (horizontal scroll);
//   * clipped   — text cut by its own box (scrollWidth > clientWidth
//                 without an ellipsis or a scroll container);
//   * tap       — an interactive control under 24×24 CSS px (WCAG 2.2
//                 2.5.8), or under 36 px tall in the phone's bars;
//   * overlap   — two visible interactive controls that intersect;
//   * row       — controls in one flex row with different heights;
//   * contrast  — axe-core color-contrast violations.
//
//   node experiments/automations-spa-server.mjs 4799 &
//   node experiments/ui-audit.mjs [url] [outDir] [views,comma,separated]
//   THEMES=dark SKIN=telegram node experiments/ui-audit.mjs …
/* global getComputedStyle, localStorage */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4799/';
const outDir = process.argv[3] ?? '/tmp/ui-audit';
const only = process.argv[4]?.split(',');
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(
  require.resolve('axe-core/axe.min.js'),
  'utf8'
);

const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['tablet', 820, 1180],
  ['phone', 390, 844],
];
const THEMES = (process.env.THEMES ?? 'light,dark').split(',');
const SKIN = process.env.SKIN ?? 't3';
const VIEWS = [
  'chat',
  'operator',
  'contacts',
  'automation',
  'patterns',
  'replies',
  'facts',
  'audience',
  'broadcast',
  'outreach',
  'profile',
  'backup',
  'status',
  'connections',
  'cv',
  'greetings',
  'settings',
].filter((v) => !only || only.includes(v));

// Runs in the page: collects the defects listed above. Everything lives
// inside one function because Playwright serialises it into the page.
const inspect = (phone) => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.visibility !== 'hidden' &&
      s.display !== 'none' &&
      Number(s.opacity) > 0
    );
  };
  const name = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const cls =
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : '';
    const text = (el.getAttribute('aria-label') ?? el.textContent ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 30);
    return `${el.tagName.toLowerCase()}${id}${cls} "${text}"`;
  };
  const vw = document.documentElement.clientWidth;
  const anyAncestor = (el, test) => {
    for (let p = el; p; p = p.parentElement) {
      if (test(getComputedStyle(p))) {
        return true;
      }
    }
    return false;
  };
  const scrollsX = (el) =>
    anyAncestor(el.parentElement, (s) =>
      ['auto', 'scroll', 'hidden'].includes(s.overflowX)
    );
  // Visually hidden on purpose: the skip link until focused, screen-reader
  // text, and the headers of a table stacked into cards on phones.
  const clippedAway = (el) =>
    anyAncestor(el, (s) => s.clipPath === 'inset(50%)');
  const shown = (el) =>
    visible(el) && !el.closest('.skip-link, .sr-only') && !clippedAway(el);
  const isClipped = (el) => {
    const s = getComputedStyle(el);
    return (
      el.children.length === 0 &&
      el.textContent.trim() &&
      el.scrollWidth > el.clientWidth + 1 &&
      s.textOverflow !== 'ellipsis' &&
      s.overflowX !== 'auto' &&
      s.overflowX !== 'scroll' &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    );
  };
  const overflowAndClipping = () => {
    const out = [];
    if (document.documentElement.scrollWidth > vw + 1) {
      out.push(
        `overflow: page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`
      );
    }
    for (const el of [...document.querySelectorAll('body *')].filter(shown)) {
      const r = el.getBoundingClientRect();
      if (!scrollsX(el) && (r.right > vw + 1 || r.left < -1)) {
        out.push(
          `overflow: ${name(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`
        );
      }
      if (isClipped(el)) {
        out.push(`clipped: ${name(el)} ${el.scrollWidth} > ${el.clientWidth}`);
      }
    }
    return out;
  };
  const controls = [
    ...document.querySelectorAll(
      'button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary'
    ),
  ].filter(visible);
  // Inline links inside running text, checkboxes and radios (which sit in
  // a larger label) are exempt from target size.
  const sized = (c) =>
    !(c.tagName === 'A' && getComputedStyle(c).display === 'inline') &&
    c.type !== 'checkbox' &&
    c.type !== 'radio';
  const tapTargets = () =>
    controls.filter(sized).flatMap((c) => {
      const r = c.getBoundingClientRect();
      const size = `${Math.round(r.width)}×${Math.round(r.height)}`;
      if (r.width < 24 || r.height < 24) {
        return [`tap: ${name(c)} ${size}`];
      }
      if (
        phone &&
        r.height < 36 &&
        c.closest('.bottom-nav, .composer, .chat-header')
      ) {
        return [`tap(phone): ${name(c)} ${size}`];
      }
      return [];
    });
  // Page content scrolls under the fixed bars by design.
  const fixedBar = (el) => el.closest('.bottom-nav, .more-sheet, .topbar');
  const comparable = (x, y) =>
    !x.contains(y) && !y.contains(x) && !fixedBar(x) === !fixedBar(y);
  const intersect = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  const overlaps = () =>
    controls.flatMap((x, i) =>
      controls
        .slice(i + 1)
        .filter(
          (y) =>
            comparable(x, y) &&
            intersect(x.getBoundingClientRect(), y.getBoundingClientRect())
        )
        .map((y) => `overlap: ${name(x)} × ${name(y)}`)
    );
  // Rows: flex containers whose direct button/input/select children sit
  // on the same line but have different heights.
  const isRow = (el) => {
    const s = getComputedStyle(el);
    return s.display.includes('flex') && !s.flexDirection.startsWith('column');
  };
  const rowHeights = (row) => {
    const lines = new Map();
    for (const k of [...row.children].filter(
      (c) => visible(c) && c.matches('button, input, select, a.button, .button')
    )) {
      const r = k.getBoundingClientRect();
      const key = Math.round(r.top / 8);
      lines.set(key, [...(lines.get(key) ?? []), [k, r]]);
    }
    return [...lines.values()]
      .filter((line) => line.length > 1)
      .flatMap((line) => {
        const hs = line.map(([, r]) => Math.round(r.height));
        return Math.max(...hs) - Math.min(...hs) > 2
          ? [
              `row: ${name(row)} heights ${hs.join('/')} (${line.map(([k]) => name(k)).join(' | ')})`,
            ]
          : [];
      });
  };
  const rows = () =>
    [...document.querySelectorAll('body *')].filter(isRow).flatMap(rowHeights);
  return [
    ...new Set([
      ...overflowAndClipping(),
      ...tapTargets(),
      ...overlaps(),
      ...rows(),
    ]),
  ];
};

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const theme of THEMES) {
  for (const [vpName, width, height] of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: theme,
      deviceScaleFactor: 1,
      // The server's CSP forbids injected scripts; axe-core needs one.
      bypassCSP: true,
    });
    await context.addInitScript(
      ([mode, skin]) => {
        localStorage.setItem('metaSovereignTheme', mode);
        localStorage.setItem('metaSovereignSkin', skin);
        localStorage.setItem(
          'metaSovereignTutorial',
          JSON.stringify({ off: true, completed: true, at: 0 })
        );
      },
      [theme, SKIN]
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url, { waitUntil: 'networkidle' });
    for (const view of VIEWS) {
      const nav = page.locator(`[data-view="${view}"].nav-item`).first();
      if (!(await nav.count())) {
        report.push(`[${theme}/${vpName}/${view}] no nav button`);
        continue;
      }
      // Phones keep the less used sections behind "More".
      if (!(await nav.isVisible())) {
        await page.click('[data-action="nav-more"]');
      }
      await nav.scrollIntoViewIfNeeded();
      await nav.click();
      await page.waitForTimeout(400);
      const issues = await page.evaluate(inspect, vpName === 'phone');
      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(async () => {
        const r = await globalThis.axe.run(document, {
          runOnly: ['color-contrast', 'target-size', 'label', 'button-name'],
        });
        return r.violations.flatMap((v) =>
          v.nodes.map(
            (n) =>
              `axe ${v.id}: ${n.target.join(' ')} — ${n.failureSummary.split('\n')[1]?.trim() ?? ''}`
          )
        );
      });
      for (const line of [...issues, ...axe]) {
        report.push(`[${theme}/${vpName}/${view}] ${line}`);
      }
      await page.screenshot({
        path: path.join(
          outDir,
          `${view}-${vpName}-${theme}${SKIN === 't3' ? '' : `-${SKIN}`}.png`
        ),
        fullPage: false,
      });
    }
    for (const e of errors) {
      report.push(`[${theme}/${vpName}] console: ${e}`);
    }
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'report.txt'), `${report.join('\n')}\n`);
console.log(`${report.length} findings → ${path.join(outDir, 'report.txt')}`);
