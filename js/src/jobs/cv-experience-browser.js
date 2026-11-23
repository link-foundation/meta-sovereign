import path from 'node:path';
import { mkdir, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { defaultStoreDir } from '../storage/app-directory.js';
import { acquireStoreLock } from '../storage/store-lock.js';
import { openBrowserSession } from '../cv/browser.js';
import { jobBrowserProfile } from './browser-profile.js';
import { attachHhExperienceCookieSource } from './cv-watch-browser.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { traceCvWatch } from './cv-watch-trace.js';
import { HH_EXPERIENCE_SLOT } from '../cv/experience-hh-workplace-receipt.js';

const HH_ORIGIN = 'https://hh.ru';

const readHhExperiencePage = () => {
  const doc = globalThis.document;
  const visible = (selector) =>
    [...doc.querySelectorAll(selector)].some(
      (node) =>
        node.getClientRects().length &&
        !node.closest('[hidden],[inert],[aria-hidden="true"]') &&
        globalThis.getComputedStyle(node).visibility === 'visible'
    );
  return {
    ready: doc.readyState !== 'loading',
    draft: Boolean(
      doc.querySelector(
        'input[name="position"],input[name="company"],textarea[data-qa="resume-editor-about"],[data-qa="resume-partial-edit-save"],[data-qa="profile-layout-save-button"]'
      )
    ),
    dialog: visible('[role="dialog"],dialog[open]'),
    challenge: visible(
      'input[name*="captcha"],.smart-captcha,[data-smartcaptcha],.g-recaptcha,.h-captcha,.cf-turnstile'
    ),
    signedOut: visible('a[data-qa="login"],[data-qa="account-login-form"]'),
    signedIn: Boolean(
      doc.querySelector(
        '[data-qa~="mainmenu_vacancyResponses"],[data-qa~="mainmenu_applicantProfilePage"]'
      )
    ),
  };
};

const idlePage = (value) => {
  if (value === 'about:blank') {
    return { blank: true };
  }
  const url = new URL(value);
  if (url.origin !== HH_ORIGIN || url.username || url.password || url.hash) {
    throw cvPrepareFailure('draft');
  }
  const login = /^\/account\/login\/?$/u.test(url.pathname);
  if (
    !login &&
    !/^\/(?:applicant\/resumes|resume\/[a-zA-Z\d_-]+|profile\/edit\/experience)\/?$/u.test(
      url.pathname
    )
  ) {
    throw cvPrepareFailure('draft');
  }
  return { login };
};

const idleSlot = async ({ page }, check) => {
  check();
  if (
    page.isClosed() ||
    page
      .context()
      .pages()
      .some((tab) => tab !== page)
  ) {
    throw cvPrepareFailure('draft');
  }
  const url = page.url();
  const state = idlePage(url);
  if (state.blank) {
    return state;
  }
  const document = await page.evaluate(readHhExperiencePage);
  check();
  if (
    page.url() !== url ||
    document.draft ||
    (document.dialog &&
      !state.login &&
      !document.signedOut &&
      !document.challenge)
  ) {
    throw cvPrepareFailure('draft');
  }
  return {
    ...document,
    signedOut: state.login || document.signedOut,
  };
};

const seedHhExperience = async ({ page, attach, check }) => {
  let existing;
  try {
    existing = await attach();
    check();
    const { page: sourcePage } = existing;
    const url = sourcePage.url();
    const state = await sourcePage.evaluate(readHhExperiencePage);
    if (!state.signedIn || state.signedOut || state.challenge) {
      return false;
    }
    const cookies = (await sourcePage.context().cookies(HH_ORIGIN)).filter(
      ({ domain, path }) =>
        /^(?:\.)?hh\.ru$/iu.test(domain) && path.startsWith('/')
    );
    check();
    const destination = page.url();
    if (
      new URL(url).origin !== HH_ORIGIN ||
      sourcePage.url() !== url ||
      sourcePage.context() === page.context() ||
      !cookies.length ||
      cookies.length > 100
    ) {
      return false;
    }
    const current = await idleSlot({ page }, check);
    if (page.url() !== destination || (!current.blank && !current.signedOut)) {
      return false;
    }
    await page.context().addCookies(cookies);
    return true;
  } catch (error) {
    check();
    traceCvWatch('experience-cookie-source-unavailable', {
      code: error.code ?? error.name,
    });
    return false;
  } finally {
    await existing?.detach();
  }
};

const waitForHhExperience = async ({
  session,
  target,
  attach,
  check,
  signal,
  phase,
  wait,
  now,
  loginMs,
}) => {
  const { page } = session;
  const navigate = async () => {
    check();
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20000 });
    check();
  };
  const signedIn = (state) =>
    state.ready && state.signedIn && !state.signedOut && !state.challenge;
  let state = await idleSlot(session, check);
  let seeded = false;
  if (state.blank) {
    seeded = await seedHhExperience({ page, attach, check });
    if (!(await idleSlot(session, check)).blank) {
      throw cvPrepareFailure('draft');
    }
    await navigate();
    state = await idleSlot(session, check);
  }
  if (state.signedOut && !seeded) {
    seeded = await seedHhExperience({ page, attach, check });
    if (seeded) {
      await idleSlot(session, check);
      await navigate();
      state = await idleSlot(session, check);
    }
  }
  if (!signedIn(state)) {
    if (session.policy?.headless) {
      throw cvPrepareFailure('login-required');
    }
    await phase('waiting-login');
    const deadline = now() + loginMs;
    while (!signedIn(state) && now() < deadline) {
      await wait(500, signal);
      state = await idleSlot(session, check);
    }
  }
  if (!signedIn(state)) {
    throw cvPrepareFailure('login-required');
  }
  if (page.url() !== target) {
    await idleSlot(session, check);
    await navigate();
    state = await idleSlot(session, check);
  }
  if (page.url() !== target || !signedIn(state)) {
    throw cvPrepareFailure('page');
  }
};

/** Hold one workspace-owned Experience profile without controlling the source Jobs tab. */
export const withHhExperienceBrowser = async ({
  store,
  storeDir = defaultStoreDir(),
  sourceSlot,
  hash,
  language,
  signal,
  phase,
  run,
  open = openBrowserSession,
  attach = attachHhExperienceCookieSource,
  wait = (ms, signal) => delay(ms, undefined, { signal }),
  now = Date.now,
  loginMs = 30 * 60000,
}) => {
  const check = () => signal.throwIfAborted();
  check();
  const workspace = await realpath(storeDir);
  const profileDir = path.join(
    workspace,
    'browser-profiles',
    'cv-experience',
    HH_EXPERIENCE_SLOT
  );
  await mkdir(profileDir, { recursive: true, mode: 0o700 });
  if ((await realpath(profileDir)) !== profileDir) {
    throw cvPrepareFailure('conflict');
  }
  const lease = await acquireStoreLock(profileDir, { exclusive: true });
  let session;
  try {
    check();
    session = await open({
      store,
      platform: 'hh',
      slot: HH_EXPERIENCE_SLOT,
      useCase: 'cv',
      persistent: true,
      profileDir,
      locale: language === 'ru' ? 'ru-RU' : 'en-US',
      signal,
    });
    await waitForHhExperience({
      session,
      target: `${HH_ORIGIN}/resume/${encodeURIComponent(hash)}`,
      attach: async () => {
        const source = await jobBrowserProfile({
          storeDir: workspace,
          browserSlot: sourceSlot,
        });
        if ((await realpath(source).catch(() => null)) === profileDir) {
          throw cvPrepareFailure('conflict');
        }
        check();
        return attach({ profileDir: source });
      },
      check,
      signal,
      phase,
      wait,
      now,
      loginMs,
    });
    return await run(session, check);
  } finally {
    try {
      await session?.detach();
    } finally {
      lease.release();
    }
  }
};
