/**
 * Real-browser CV end-to-end run (issue #29, R-V21).
 *
 * Issue #29 asks for the whole CV pipeline to be exercisable before we
 * have authenticated access to any job board: "even if we don't have
 * direct markup access yet, we should be able all telemetry is in
 * place, and full draft of all steps is in place … so as soon as we
 * start testing we will be able to get all logs, recordings of markup
 * change and so on".
 *
 * This harness does exactly that, without touching a live site:
 *
 *   1. Every page a plan visits is generated *from the plan itself*
 *      (`js/tests/helpers/markup-fixture.js`), so a fixture can never
 *      drift away from the selectors the runner uses.
 *   2. Playwright request interception serves those pages at the
 *      platform's own URLs, so `requireUrl` session checks, absolute
 *      `goto` targets and multi-page plans behave as in production.
 *   3. The run goes through the shipped code — `openBrowserSession`
 *      with an injected launcher, a real `browser-commander`,
 *      `readCvFrom` and `updateCvOn` — so the commander API the runner
 *      depends on (count, textContent, evaluate, fillTextArea,
 *      clickButton, pressKey, page.screenshot) is verified against a
 *      real Chromium instead of a stub.
 *   4. Each platform is then re-read against markup with one field
 *      removed, which must produce a `step.miss`, a `markup.changed`
 *      event and a drift reason — the "recording of markup change"
 *      the issue asks for.
 *
 * Playwright and its Chromium download are optional dependencies, so
 * this is not part of `npm test`. Run it explicitly:
 *
 *   RUN_BROWSER_E2E=1 npm run test:e2e:cv
 *
 * Without `RUN_BROWSER_E2E=1`, or when the optional packages are
 * missing, it exits 0 with a skip message so CI jobs without a browser
 * stay green.
 */

import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCvPlatform, listCvPlatforms } from '../src/cv/platforms/index.js';
import { readCvFrom, updateCvOn } from '../src/cv/index.js';
import { openBrowserSession } from '../src/cv/browser.js';
import { baselineFromReport, createMemorySink } from '../src/cv/telemetry.js';
import { assignPath } from '../src/cv/runner.js';
import { emptyCv } from '../src/cv/model.js';
import {
  FIXTURE_ROWS,
  fixturePagesFor,
  fixtureText,
} from './helpers/markup-fixture.js';

const skip = (message) => {
  console.log(`[e2e-cv-browser] SKIP: ${message}`);
  process.exit(0);
};

if (!process.env.RUN_BROWSER_E2E) {
  skip('RUN_BROWSER_E2E not set');
}

let playwright = null;
try {
  playwright = await import('playwright');
} catch {
  skip('playwright is not installed (npm i playwright)');
}
try {
  await import('browser-commander');
} catch {
  skip('browser-commander is not installed (npm i browser-commander)');
}

/**
 * Variables a live run gets from the session or from a mapper.
 *
 * `login` is the account the browser is signed in as; `editTargets`
 * normally comes out of Habr Career's SSR state, and `resumeId` out of
 * hh.ru's resume list — JSON payloads a generated fixture cannot
 * invent, which is why the CLI also accepts them as `--var` pairs.
 */
const EDIT_TARGETS = {
  about: 'https://career.habr.com/e2e-user/edit/about',
  companies: 'https://career.habr.com/e2e-user/edit/companies',
};

const PLATFORM_VARS = {
  'habr-career': { login: 'e2e-user', editTargets: EDIT_TARGETS },
  hh: { resumeId: 'e2e-resume' },
};

/**
 * Payloads for the `extractJson` steps, by platform and mapper name.
 *
 * Habr Career reuses the SSR state captured in
 * `js/tests/fixtures/habr-career-profile-state.json` — the same blob
 * the mapper unit tests read — with the owner-only `edit` links filled
 * in, because a signed-out capture has none and the update plan
 * navigates to them. VietnamWorks gets a `__NEXT_DATA__` payload shaped
 * like the one its mapper documents.
 */
const habrState = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('./fixtures/habr-career-profile-state.json', import.meta.url)
    ),
    'utf8'
  )
);

const habrOwnerState = {
  ...habrState,
  resume: {
    ...habrState.resume,
    about: { ...habrState.resume?.about, edit: EDIT_TARGETS.about },
    companies: { ...habrState.resume?.companies, edit: EDIT_TARGETS.companies },
  },
};

const PLATFORM_JSON = {
  'habr-career': { state: habrOwnerState, editTargets: habrOwnerState },
  vietnamworks: {
    nextData: {
      props: {
        pageProps: {
          profile: {
            fullName: 'E2E Candidate',
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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`assertion failed: ${message}`);
  }
};

const eventsOf = (report, type) =>
  (report.events ?? []).filter((event) => event.type === type);

const readValues = (report, valuePath) =>
  eventsOf(report, 'value.read')
    .filter((event) => event.path === valuePath)
    .map((event) => event.value);

/** Scalar reads: their fixture text must come back verbatim. */
const scalarReads = (platform) =>
  platform.read.filter((step) => step.action === 'read' && !step.attribute);

const listReads = (platform) =>
  platform.read.filter((step) =>
    ['readList', 'readRecords'].includes(step.action)
  );

const checkRead = (platform, result, sink) => {
  const { report } = result;
  assert(
    report.problems.length === 0,
    `${platform.id}: clean read reported problems: ${report.problems.join('; ')}`
  );
  for (const step of scalarReads(platform)) {
    const expected = fixtureText(platform.id, step.path);
    const seen = readValues(report, step.path);
    assert(
      seen.includes(expected),
      `${platform.id}: ${step.path} read ${JSON.stringify(seen)}, expected "${expected}"`
    );
  }
  for (const step of listReads(platform)) {
    const [seen] = readValues(report, step.path);
    assert(
      Array.isArray(seen) && seen.length === FIXTURE_ROWS,
      `${platform.id}: ${step.path} read ${JSON.stringify(seen)}, expected ${FIXTURE_ROWS} rows`
    );
  }
  assert(result.fields > 0, `${platform.id}: the read produced an empty CV`);
  assert(
    sink.events.length === report.events.length,
    `${platform.id}: sink saw ${sink.events.length} events, report has ${report.events.length}`
  );
};

const checkArtifacts = async (platform, report, artifactDir) => {
  const written = eventsOf(report, 'screenshot').filter(
    (event) => event.kind !== 'skipped'
  );
  assert(
    written.length > 0,
    `${platform.id}: the run left no artifacts to debug with`
  );
  for (const event of written) {
    assert(
      event.path.startsWith(artifactDir),
      `${platform.id}: artifact escaped the run directory: ${event.path}`
    );
    const stat = await fs.stat(event.path);
    assert(stat.size > 0, `${platform.id}: artifact ${event.path} is empty`);
  }
  const wantsScreenshot = platform.read.some(
    (step) => step.action === 'screenshot'
  );
  assert(
    !wantsScreenshot || written.some((event) => event.kind === 'png'),
    `${platform.id}: the plan asks for a screenshot but none was captured`
  );
};

const checkDrift = (platform, report, omittedPath) => {
  assert(
    eventsOf(report, 'step.miss').some((event) =>
      event.step.includes(omittedPath)
    ),
    `${platform.id}: removing ${omittedPath} produced no step.miss`
  );
  const changed = eventsOf(report, 'markup.changed');
  assert(
    changed.length > 0,
    `${platform.id}: the markup changed but no markup.changed event was emitted`
  );
  assert(
    changed.every((event) => event.reasons.length > 0),
    `${platform.id}: markup.changed carried no reason to debug with`
  );
  assert(
    report.problems.some((problem) => problem.startsWith('markup changed at')),
    `${platform.id}: the report does not mention the markup change`
  );
};

/** A CV holding a distinct value for every path a group writes. */
const cvForGroup = (platform, group) => {
  const cv = emptyCv();
  for (const step of group.steps.filter((entry) => entry.action === 'fill')) {
    const value = fixtureText(platform.id, `write ${step.path}`);
    // A list section (`skills`) takes an array; `section[].field`
    // addresses the first record; everything else is a scalar.
    assignPath(cv, step.path, step.path.includes('.') ? value : [value]);
  }
  return cv;
};

const checkUpdate = (platform, group, result) => {
  const { report } = result;
  assert(
    result.applied.includes(group.id),
    `${platform.id}: update group "${group.id}" was not applied`
  );
  for (const step of group.steps.filter((entry) => entry.action === 'fill')) {
    const expected = fixtureText(platform.id, `write ${step.path}`);
    const written = eventsOf(report, 'value.write')
      .filter((event) => event.path === step.path)
      .map((event) => event.value);
    assert(
      written.includes(expected),
      `${platform.id}/${group.id}: ${step.path} wrote ${JSON.stringify(written)}, expected "${expected}"`
    );
  }
  assert(
    report.problems.length === 0,
    `${platform.id}/${group.id}: update reported problems: ${report.problems.join('; ')}`
  );
};

/** Fills that browser-commander re-read from the page after typing. */
const verifiedFills = (report) =>
  eventsOf(report, 'step.ok').filter((event) => event.verified === true);

const readPlatform = async ({ platform, vars, json, state, artifactDir }) => {
  const sink = createMemorySink();
  state.pages = fixturePagesFor(platform, { vars, json });
  const result = await readCvFrom(platform.id, {
    commander: state.commander,
    artifactDir,
    vars,
    sink,
  });
  checkRead(platform, result, sink);
  await checkArtifacts(platform, result.report, artifactDir);
  return result;
};

const driftPlatform = async ({
  platform,
  vars,
  json,
  state,
  artifactDir,
  read,
}) => {
  const [omitted] = scalarReads(platform);
  state.pages = fixturePagesFor(platform, {
    vars,
    json,
    omit: [omitted.path],
  });
  const result = await readCvFrom(platform.id, {
    commander: state.commander,
    artifactDir,
    vars,
    baseline: baselineFromReport(read.report),
  });
  checkDrift(platform, result.report, omitted.path);
  return result;
};

const updatePlatform = async ({
  platform,
  group,
  vars,
  json,
  state,
  artifactDir,
}) => {
  state.pages = fixturePagesFor(platform, {
    plan: 'update',
    groups: [group.id],
    vars,
    json,
  });
  const result = await updateCvOn(platform.id, cvForGroup(platform, group), {
    commander: state.commander,
    groups: [group.id],
    artifactDir,
    vars,
  });
  checkUpdate(platform, group, result);
  return result;
};

const runPlatform = async ({ id, state, artifactDir }) => {
  const platform = getCvPlatform(id);
  const vars = PLATFORM_VARS[id] ?? {};
  const json = PLATFORM_JSON[id] ?? {};
  const read = await readPlatform({ platform, vars, json, state, artifactDir });
  const drift = await driftPlatform({
    platform,
    vars,
    json,
    state,
    artifactDir,
    read,
  });
  let verified = 0;
  for (const group of platform.update) {
    const result = await updatePlatform({
      platform,
      group,
      vars,
      json,
      state,
      artifactDir,
    });
    verified += verifiedFills(result.report).length;
  }
  const fills = platform.update.flatMap((group) =>
    group.steps.filter((step) => step.action === 'fill')
  );
  assert(
    fills.length === 0 || verified > 0,
    `${id}: no fill was verified in the page after writing`
  );
  return {
    platform: id,
    fields: read.fields,
    steps: platform.stepCount,
    groups: platform.update.length,
    verifiedFills: verified,
    driftMisses: eventsOf(drift.report, 'step.miss').length,
  };
};

const main = async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ms-cv-e2e-'));
  const state = { pages: new Map(), commander: null };
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.route('**/*', async (route) => {
    const url = route.request().url().split('#')[0];
    // A URL the plan never declared gets a valid but empty page, so a
    // wrong `goto` fails the plan's own `waitFor` instead of reaching
    // the internet.
    const body = state.pages.get(url) ?? EMPTY_PAGE;
    await route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  // The shipped session factory, with the browser injected: the
  // commander under test is built exactly as production builds it.
  const session = await openBrowserSession({
    platform: 'e2e',
    launcher: async () => ({ page, context, close: async () => {} }),
  });
  state.commander = session.commander;
  const rows = [];
  try {
    for (const id of listCvPlatforms()) {
      rows.push(await runPlatform({ id, state, artifactDir }));
      console.log(`[e2e-cv-browser] ok ${id}`);
    }
  } finally {
    await session.close();
    await context.close();
    await browser.close();
  }
  console.table(rows);
  console.log(`[e2e-cv-browser] artifacts in ${artifactDir}`);
  console.log(`[e2e-cv-browser] PASS (${rows.length} platforms)`);
};

await main();
