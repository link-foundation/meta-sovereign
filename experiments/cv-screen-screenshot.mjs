/**
 * Screenshot the SPA's CV screen against a real backend (issue #29).
 *
 * The screen is new UI, so the case study needs a picture of it that
 * nobody had to draw by hand. This script wires the shipped pieces
 * together:
 *
 *   1. every page the seven read plans visit is generated from the
 *      plans themselves (`js/tests/helpers/markup-fixture.js`) and
 *      served at the platforms' own URLs through Playwright request
 *      interception — no live job board is touched;
 *   2. a real `browser-commander` session over that page is handed to
 *      `startServer({cv: {commander}})`, so `/api/cv/read` and
 *      `/api/cv/sync` do exactly what they do in production;
 *   3. a second browser page opens the SPA the server serves and
 *      clicks through Read → Compare → Plan sync, screenshotting the
 *      result.
 *
 * Usage (needs the optional playwright + browser-commander packages):
 *
 *   node experiments/cv-screen-screenshot.mjs [outDir]
 */

import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { startServer } from '../js/src/server/index.js';
import { openBrowserSession } from '../js/src/cv/browser.js';
import {
  listCvPlatforms,
  getCvPlatform,
} from '../js/src/cv/platforms/index.js';
import { fixturePagesFor } from '../js/tests/helpers/markup-fixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outDir =
  process.argv[2] ??
  path.join(repoRoot, 'docs/case-studies/issue-29/screenshots');

const LOGIN = 'e2e-user';
const EDIT_TARGETS = {
  about: `https://career.habr.com/${LOGIN}/edit/about`,
  companies: `https://career.habr.com/${LOGIN}/edit/companies`,
};
const VARS = { login: LOGIN, editTargets: EDIT_TARGETS };

const habrState = JSON.parse(
  readFileSync(
    path.join(repoRoot, 'js/tests/fixtures/habr-career-profile-state.json'),
    'utf8'
  )
);

const PLATFORM_JSON = {
  'habr-career': { state: habrState, editTargets: habrState },
  vietnamworks: {
    nextData: {
      props: {
        pageProps: {
          profile: {
            fullName: 'Anna Ivanova',
            currentJobTitle: 'Backend Engineer',
            address: 'Ho Chi Minh City',
            expectedSalary: '2000 USD',
            skills: [{ name: 'Go' }, { skillName: 'Kubernetes' }],
            workingExperiences: [
              {
                companyName: 'Acme VN',
                jobTitle: 'Backend Engineer',
                duration: 'Jan 2022 - Present',
              },
            ],
            educations: [{ schoolName: 'HCMUT', major: 'Computer Science' }],
          },
        },
      },
    },
  },
};

const EMPTY_PAGE = '<!doctype html><html lang="en"><body></body></html>';

/** Union of every platform's read fixtures, keyed by URL. */
const allReadPages = () => {
  const pages = new Map();
  for (const id of listCvPlatforms()) {
    for (const [url, html] of fixturePagesFor(getCvPlatform(id), {
      vars: VARS,
      json: PLATFORM_JSON[id] ?? {},
    })) {
      pages.set(url, html);
    }
  }
  return pages;
};

/**
 * `anchor` scrolls a section into view and shoots the viewport around
 * it; without an anchor the whole page is captured. A full-page shot
 * of the comparison table is ~20 000 px tall (194 differing fields),
 * which is unreadable and far too heavy to commit, so every state
 * after the read is anchored.
 */
const shot = async (page, name, anchor) => {
  const file = path.join(outDir, `${name}.png`);
  if (anchor) {
    await page.locator(anchor).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
  }
  await page.screenshot({ path: file, fullPage: !anchor });
  console.log(`[cv-screenshot] wrote ${file}`);
};

const main = async () => {
  await fs.mkdir(outDir, { recursive: true });
  const storeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cv-shot-'));
  const pages = allReadPages();

  const browser = await chromium.launch({ headless: true });
  const fixtureContext = await browser.newContext();
  const fixturePage = await fixtureContext.newPage();
  fixturePage.setDefaultTimeout(10_000);
  await fixturePage.route('**/*', async (route) => {
    const url = route.request().url().split('#')[0];
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: pages.get(url) ?? EMPTY_PAGE,
    });
  });
  const session = await openBrowserSession({
    platform: 'screenshot',
    launcher: async () => ({
      page: fixturePage,
      context: fixtureContext,
      close: async () => {},
    }),
  });

  const server = await startServer({
    port: 0,
    storeDir,
    cv: { commander: session.commander },
  });
  const base = `http://127.0.0.1:${server.port}`;

  const uiContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const ui = await uiContext.newPage();
  ui.setDefaultTimeout(30_000);
  try {
    await ui.goto(base);
    await ui.click('[data-action="tutorial-off"]');
    await ui.click('[data-view="cv"]');
    await ui.waitForSelector('table.cv-platforms');
    await shot(ui, 'cv-screen-catalogue');

    await ui.fill('.cv-controls input', LOGIN);
    await ui.click('[data-action="cv-read"]');
    await ui.waitForFunction(
      () => document.querySelectorAll('.cv-telemetry li').length > 0,
      null,
      { timeout: 180_000 }
    );
    await shot(ui, 'cv-screen-after-read');

    await ui.click('[data-action="cv-compare"]');
    await ui.waitForSelector('table.cv-comparison');
    await shot(ui, 'cv-screen-differences', 'table.cv-comparison');

    await ui.click('[data-action="cv-plan-sync"]');
    // A dry-run plan re-reads every platform through the fixtures, so
    // it takes as long as the read above rather than a UI heartbeat.
    await ui.waitForSelector('.cv-sync-plan [data-dry-run="true"]', {
      timeout: 180_000,
    });
    await shot(ui, 'cv-screen-sync-plan', '.cv-sync-plan');
    await shot(ui, 'cv-screen-telemetry', 'ul.cv-telemetry');

    const summary = await ui.evaluate(() => ({
      platforms: document.querySelectorAll('.cv-platforms tbody tr').length,
      snapshots: [
        ...document.querySelectorAll('.cv-platforms tbody tr td:last-child'),
      ].filter((cell) => !/no snapshot/i.test(cell.textContent ?? '')).length,
      conflicts: document.querySelectorAll('.cv-comparison tbody tr').length,
      runs: document.querySelectorAll('.cv-telemetry li').length,
      actions: document.querySelectorAll('.cv-sync-plan li').length,
      failures: [...document.querySelectorAll('.cv-failures li')].map(
        (item) => item.textContent
      ),
    }));
    console.log('[cv-screenshot]', JSON.stringify(summary, null, 2));
  } finally {
    await server.close();
    await session.close();
    await uiContext.close();
    await fixtureContext.close();
    await browser.close();
  }
};

await main();
