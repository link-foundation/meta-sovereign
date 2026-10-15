/**
 * Real-browser tutorial walk-through.
 *
 * Checks what a user actually sees and does, in Chromium and WebKit
 * (Safari's engine) at desktop, short-desktop, tablet and phone sizes:
 *
 *   - every step's card is inside the viewport and never overlaps the
 *     control it points at (so that control stays clickable/visible);
 *   - clicking the highlighted control advances the tour: Connections
 *     → the whole section lit (sign-ins and every service, each
 *     reachable past the card) → Email (first: biggest service) → its
 *     "Enter manually" steps and "Import with browser" panel;
 *   - "Next" on an action step performs the click (the app follows);
 *   - Back goes back, Esc closes; the card takes focus once the user
 *     is in the tour (not on page load: the skip link stays first);
 *   - after the nav drawer scrolls, ring and card are still on the
 *     target in the very same frame (no trailing outline);
 *   - every step is shown on its own page: after a reload (the app
 *     reopens on Chat), after Back across pages, after leaving mid-step
 *     ("Show me"), and when another service than Email is picked.
 *
 * Playwright and its browsers are optional dependencies, so this is
 * not part of `npm test`. Run it explicitly:
 *
 *   RUN_BROWSER_E2E=1 npm run test:e2e:tutorial
 *
 * WebKit is used when installed (`npx playwright install webkit`).
 * Without `RUN_BROWSER_E2E=1`, or without Playwright, it exits 0 with
 * a skip message.
 */

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startServer } from '../src/server/index.js';

const skip = (message) => {
  console.log(`[e2e-tutorial-browser] SKIP: ${message}`);
  process.exit(0);
};

if (process.env.RUN_BROWSER_E2E !== '1') {
  skip('set RUN_BROWSER_E2E=1 to run');
}

let playwright;
try {
  playwright = await import('playwright');
} catch {
  skip('playwright is not installed');
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'short-desktop', width: 1280, height: 560 },
  { name: 'tablet', width: 800, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

const failures = [];
const check = (ok, label) => {
  if (!ok) {
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
};

const geometry = (page) =>
  page.evaluate(() => {
    const card = document.querySelector('.tutorial-step');
    const overlay = document.querySelector('[data-tutorial-overlay]');
    const id = overlay?.getAttribute('data-tutorial-target');
    const target = id
      ? [...document.querySelectorAll(`[data-tutorial-id="${id}"]`)].find(
          (el) => el.getBoundingClientRect().width > 0
        )
      : null;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    };
    return {
      step: card?.getAttribute('data-tutorial-step') ?? null,
      side: card?.getAttribute('data-side') ?? null,
      focused: document.activeElement === card,
      card: card ? box(card) : null,
      target: target ? box(target) : null,
      targetId: target ? id : null,
      scrollY: globalThis.scrollY,
      viewport: {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      },
    };
  });

const overlaps = (a, b) =>
  a.left < b.left + b.width - 0.5 &&
  b.left < a.left + a.width - 0.5 &&
  a.top < b.top + b.height - 0.5 &&
  b.top < a.top + a.height - 0.5;

const waitForStep = (page, id) =>
  page.waitForSelector(`[data-tutorial-step="${id}"]`, { timeout: 5000 });

// Visible, and settled into its final place (the card is hidden while
// it waits for its target and while it is first measured).
const settle = async (page) => {
  await page.waitForFunction(() => {
    const card = document.querySelector('.tutorial-step');
    return card && globalThis.getComputedStyle(card).visibility !== 'hidden';
  });
  await page.waitForTimeout(250);
};

const assertPlacement = async (page, label, { focus = true } = {}) => {
  const g = await geometry(page);
  const where = `${label} [${g.step}, side=${g.side}]`;
  check(Boolean(g.card), `${where}: card rendered`);
  if (!g.card) {
    return g;
  }
  const { card, viewport } = g;
  check(
    card.left >= 0 &&
      card.top >= 0 &&
      card.left + card.width <= viewport.width + 0.5 &&
      card.top + card.height <= viewport.height + 0.5,
    `${where}: card inside viewport ${JSON.stringify(card)} target ${JSON.stringify(g.target)} scrollY ${g.scrollY}`
  );
  if (g.target && g.side !== 'dock') {
    check(
      !overlaps(card, g.target),
      `${where}: card ${JSON.stringify(card)} covers target ${JSON.stringify(g.target)}`
    );
  }
  if (focus) {
    check(g.focused, `${where}: card has focus`);
  }
  return g;
};

// The whole Connections section is lit: sign-ins and every service.
// However the card is placed, each of them can be scrolled clear of it
// and clicked (the last service included).
const assertSectionReachable = async (page, label) => {
  const lit = await page.evaluate(() => {
    const section = document.querySelector(
      '[data-tutorial-id="connections:list"]'
    );
    return {
      signIns: Boolean(
        section?.querySelector('[data-tutorial-id="connections:sign-ins"]')
      ),
      services: section?.querySelectorAll('[data-provider-id]').length ?? 0,
    };
  });
  check(
    lit.signIns && lit.services > 10,
    `${label}: pick must light sign-ins and all services ${JSON.stringify(lit)}`
  );
  const last = await page.evaluate(() => {
    globalThis.scrollTo(0, document.documentElement.scrollHeight);
    const cards = document.querySelectorAll(
      '[data-tutorial-id="connections:list"] [data-provider-id]'
    );
    const r = cards[cards.length - 1].getBoundingClientRect();
    const c = document.querySelector('.tutorial-step').getBoundingClientRect();
    const covered =
      r.left < c.right &&
      c.left < r.right &&
      r.top < c.bottom &&
      c.top < r.bottom;
    return { covered, card: c.top, service: r.bottom };
  });
  check(
    !last.covered,
    `${label}: the last service stays under the card ${JSON.stringify(last)}`
  );
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.waitForTimeout(150);
};

// The whole provider page is lit: Back, both tabs and the open panel,
// and the tabs are never under the card (the step tells the user to
// switch between them).
const assertDetailLit = async (page, label, mode) => {
  const lit = await page.evaluate(() => {
    const section = document.querySelector(
      '[data-tutorial-id="connections:detail"]'
    );
    const card = document.querySelector('.tutorial-step');
    const c = card?.getBoundingClientRect();
    const covered = (el) => {
      const r = el.getBoundingClientRect();
      return Boolean(
        c &&
        r.left < c.right &&
        c.left < r.right &&
        r.top < c.bottom &&
        c.top < r.bottom
      );
    };
    const tabs = [...(section?.querySelectorAll('[role="tab"]') ?? [])];
    return {
      mode: section?.getAttribute('data-mode') ?? null,
      back: Boolean(section?.querySelector('.connections-back')),
      tabs: tabs.length,
      tabsCovered: tabs.some(covered),
    };
  });
  check(
    lit.mode === mode && lit.back && lit.tabs === 2 && !lit.tabsCovered,
    `${label}: setup lights the whole ${mode} page ${JSON.stringify(lit)}`
  );
};

// Pick Email by "Enter manually" (the recommended "Import with
// browser" would open a real browser window).
const pickEmailManually = async (page, label) => {
  await page.click(
    '[data-tutorial-id="connections:email"] [data-action="open-connection-detail"]'
  );
  await waitForStep(page, 'setup');
  await settle(page);
  const manual = await assertPlacement(page, label);
  check(
    manual.targetId === 'connections:detail',
    `${label}: setup on "Enter manually" points at ${manual.targetId}`
  );
  await assertDetailLit(page, label, 'manual');
  // The user's own click on the tab takes focus there, as it should.
  await page.click('[data-action="connection-mode-import"]');
  await settle(page);
  const setup = await assertPlacement(page, label, { focus: false });
  check(
    setup.targetId === 'connections:detail',
    `${label}: setup on "Import with browser" points at ${setup.targetId}`
  );
  await assertDetailLit(page, label, 'import');
  check(
    (await placeOf(page)).hash === '#conn-email',
    `${label}: the import tab is #conn-email`
  );
};

const walk = async (engineName, viewport, base) => {
  const browser = await playwright[engineName].launch();
  const page = await browser.newPage({ viewport });
  const label = `${engineName}/${viewport.name}`;
  console.log(`- ${label}`);
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => globalThis.localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });

    await waitForStep(page, 'connect');
    await settle(page);
    // Opened by itself on load: focus stays put, the skip link is
    // still the first Tab stop.
    await assertPlacement(page, label, { focus: false });
    // (WebKit, like Safari by default, skips links on Tab.)
    if (engineName === 'chromium') {
      await page.keyboard.press('Tab');
      const first = await page.evaluate(
        () => globalThis.document.activeElement?.className ?? ''
      );
      check(
        String(first).includes('skip-link'),
        `${label}: first Tab stop is "${first}", not the skip link`
      );
    }

    // The user does what the step says: click Connections.
    await page.click('[data-tutorial-id="nav:connections"] >> visible=true');
    await waitForStep(page, 'pick');
    await settle(page);
    await assertPlacement(page, label);
    const first = await page.evaluate(
      () =>
        document
          .querySelector('[data-provider-id]')
          ?.getAttribute('data-provider-id') ?? null
    );
    check(first === 'email', `${label}: first service is ${first}, not email`);

    // Back returns to the previous step; Next on it performs the click.
    await page.click('[data-action="tutorial-back"]');
    await waitForStep(page, 'connect');
    await page.click('[data-action="tutorial-next"]');
    await waitForStep(page, 'pick');
    await settle(page);
    const pick = await assertPlacement(page, label);
    check(
      pick.targetId === 'connections:list',
      `${label}: pick lights ${pick.targetId}, not the whole section`
    );
    await assertSectionReachable(page, label);

    await pickEmailManually(page, label);

    for (const id of ['chat', 'contacts', 'automation', 'backup']) {
      await page.click('[data-action="tutorial-next"]');
      await waitForStep(page, id);
      await settle(page);
      await assertPlacement(page, label);
    }

    // Short desktop: the drawer scrolls; ring and card must follow in
    // the same frame.
    if (viewport.name === 'short-desktop') {
      // Back to the start.
      for (let i = 0; i < 12; i += 1) {
        if ((await geometry(page)).step === 'connect') {
          break;
        }
        await page
          .click('[data-action="tutorial-back"]', { timeout: 1500 })
          .catch(() => {});
      }
      await waitForStep(page, 'connect');
      await settle(page);
      const drift = await page.evaluate(() => {
        const nav = document.querySelector('nav.permanent-drawer');
        const target = document.querySelector(
          '[data-tutorial-id="nav:connections"]'
        );
        const ring = document.querySelector('.tutorial-spotlight-frame');
        const card = document.querySelector('.tutorial-step');
        const offset = () => {
          const t = target.getBoundingClientRect();
          return {
            ring: ring.getBoundingClientRect().top - t.top,
            card: card.getBoundingClientRect().top - t.top,
          };
        };
        nav.scrollTop = 0;
        const before = offset();
        nav.scrollTop = nav.scrollHeight;
        const after = offset();
        return {
          scrolled: nav.scrollTop,
          anchors: globalThis.CSS.supports('anchor-name: --a'),
          ring: Math.abs(after.ring - before.ring),
          card: Math.abs(after.card - before.card),
        };
      });
      // Chromium applies anchor scroll adjustment on the compositor, so
      // only engines that report it synchronously are asserted.
      if (engineName === 'webkit' && drift.anchors && drift.scrolled > 0) {
        check(
          drift.ring < 1,
          `${label}: ring trails scroll by ${drift.ring}px`
        );
      }
      console.log(`  scroll drift ${JSON.stringify(drift)}`);
    }

    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-tutorial-overlay]', {
      state: 'detached',
      timeout: 3000,
    });
  } catch (error) {
    const at = await geometry(page).catch(() => ({}));
    const message = `${error.message.split('\n')[0]} (on step ${at.step}, side=${at.side})`;
    failures.push(`${label}: ${message}`);
    console.log(`  ✗ ${message}`);
    await page
      .screenshot({
        path: path.join(os.tmpdir(), `tutorial-${label.replace('/', '-')}.png`),
      })
      .catch(() => {});
  } finally {
    await browser.close();
  }
};

// Edge cases around pages: reloads (the app always reopens on Chat),
// leaving mid-step, Back across pages, and picking another service.
const placeOf = (page) =>
  page.evaluate(() => ({
    view:
      document.querySelector('main[data-view]')?.getAttribute('data-view') ??
      null,
    hash: globalThis.location.hash,
    step:
      document
        .querySelector('.tutorial-step')
        ?.getAttribute('data-tutorial-step') ?? null,
    next:
      document
        .querySelector('[data-action="tutorial-next"]')
        ?.textContent.trim() ?? null,
  }));

const waitForPlace = (page, view, detail) =>
  page.waitForFunction(
    ([v, d]) => {
      const main = document.querySelector('main[data-view]');
      const onDetail = globalThis.location.hash.startsWith('#conn-');
      return main?.getAttribute('data-view') === v && onDetail === d;
    },
    [view, detail],
    { timeout: 5000 }
  );

const edgeCases = async (engineName, viewport, base) => {
  const browser = await playwright[engineName].launch();
  const page = await browser.newPage({ viewport });
  const label = `${engineName}/${viewport.name}/pages`;
  console.log(`- ${label}`);
  const at = async (step, view, detail, what) => {
    await waitForStep(page, step);
    await waitForPlace(page, view, detail);
    await settle(page);
    const g = await assertPlacement(page, `${label} ${what}`, {
      focus: false,
    });
    check(g.target !== null, `${label} ${what}: target on screen`);
  };
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => globalThis.localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForStep(page, 'connect');
    await page.click('[data-action="tutorial-next"]');
    await at('pick', 'connections', false, 'pick');

    // 1. Reload on "pick": the app opens on Chat, the tour reopens
    //    Connections and points at Email again.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await at('pick', 'connections', false, 'pick after reload');

    // 2. The user leaves mid-step: the tour stays put, Next becomes
    //    "Show me" and brings them back.
    await page.click('[data-tutorial-id="nav:chat"] >> visible=true');
    await waitForPlace(page, 'chat', false);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-action="tutorial-next"]')?.textContent ===
        'Show me',
      undefined,
      { timeout: 5000 }
    );
    check(
      (await placeOf(page)).step === 'pick',
      `${label}: leaving the page must not advance the tour`
    );
    await page.click('[data-action="tutorial-next"]');
    await at('pick', 'connections', false, 'pick after "Show me"');
    check(
      (await placeOf(page)).next === 'Next',
      `${label}: "Show me" turns back into Next`
    );

    // 3. Another service's "Enter manually": the tour follows that
    //    page and tab.
    await page.click(
      '[data-tutorial-id="connections:telegram"] [data-action="open-connection-detail"]'
    );
    await at('setup', 'connections', true, 'setup on Telegram');
    check(
      (await placeOf(page)).hash === '#conn-telegram/manual',
      `${label}: setup must stay on the chosen service`
    );

    // 4. Back from the provider page: "pick" is on the list, and being
    //    on a provider page a moment ago does not skip it forward.
    await page.click('[data-action="tutorial-back"]');
    await at('pick', 'connections', false, 'pick after Back');
    await page.waitForTimeout(400);
    check(
      (await placeOf(page)).step === 'pick',
      `${label}: Back to "pick" must stay on "pick"`
    );

    // 5. Next opens Email's page, exactly one step forward.
    await page.click('[data-action="tutorial-next"]');
    await at('setup', 'connections', true, 'setup on Email');
    await page.waitForTimeout(400);
    check(
      (await placeOf(page)).step === 'setup',
      `${label}: one Next must move exactly one step`
    );

    // 6. Reload on "setup": a provider page is reopened.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await at('setup', 'connections', true, 'setup after reload');

    // 7. Back to Chat later in the tour and Back again onto "setup":
    //    the provider page opens again.
    await page.click('[data-action="tutorial-next"]');
    await waitForStep(page, 'chat');
    await page.click('[data-tutorial-id="nav:chat"] >> visible=true');
    await waitForStep(page, 'contacts');
    await page.click('[data-action="tutorial-back"]');
    await page.click('[data-action="tutorial-back"]');
    await at('setup', 'connections', true, 'setup via Back from Chat');
  } catch (error) {
    const where = await placeOf(page).catch(() => ({}));
    const message = `${error.message.split('\n')[0]} (at ${JSON.stringify(where)})`;
    failures.push(`${label}: ${message}`);
    console.log(`  ✗ ${message}`);
    await page
      .screenshot({
        path: path.join(
          os.tmpdir(),
          `tutorial-${label.replaceAll('/', '-')}.png`
        ),
      })
      .catch(() => {});
  } finally {
    await browser.close();
  }
};

const engines = [];
for (const name of (process.env.E2E_ENGINES ?? 'chromium,webkit').split(',')) {
  try {
    const browser = await playwright[name].launch();
    await browser.close();
    engines.push(name);
  } catch {
    console.log(`[e2e-tutorial-browser] ${name} not installed, skipped`);
  }
}
if (engines.length === 0) {
  skip('no Playwright browser is installed');
}

const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-tutorial-e2e-'));
const handle = await startServer({ port: 0, storeDir, enableSync: false });
const base = `http://127.0.0.1:${handle.port}/`;
try {
  for (const engineName of engines) {
    for (const viewport of VIEWPORTS) {
      await walk(engineName, viewport, base);
    }
    for (const viewport of VIEWPORTS.filter((v) =>
      ['desktop', 'phone'].includes(v.name)
    )) {
      await edgeCases(engineName, viewport, base);
    }
  }
} finally {
  await handle.close();
}

if (failures.length > 0) {
  console.log(`[e2e-tutorial-browser] ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('[e2e-tutorial-browser] all checks passed');
