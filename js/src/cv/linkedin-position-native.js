import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireStoreLock } from '../storage/store-lock.js';
import { defaultProfileDir, openBrowserSession } from './browser.js';
import { linkedinExperienceGate } from './linkedin-experience-dom.js';
import { linkedinExperienceDocument } from './linkedin-experience-parse.js';
import { traverseLinkedinExperience } from './linkedin-experience-reader.js';
import { linkedinSessionGate } from './linkedin-experience-session.js';
import {
  fillLinkedinPosition,
  linkedinPositionForm,
} from './linkedin-position-fields.js';
import { linkedinPositionFailure } from './linkedin-position-plan.js';
import {
  fillLinkedinPositionSkills,
  readLinkedinProfileSkills,
} from './linkedin-position-skills.js';

const detach = (session) =>
  session?.detach ? session.detach() : session?.close();
const signedIn = async (session) =>
  (await session.page.context().cookies('https://www.linkedin.com')).some(
    ({ name }) => name === 'li_at'
  );
const clearSlot = async (session, url, check) => {
  const context = session.page.context();
  const pages = context.pages();
  if (pages.length > 20 || !pages.includes(session.page)) {
    throw linkedinPositionFailure('session');
  }
  const root = url.replace(/details\/experience\/$/u, '');
  for (const page of pages) {
    check();
    const gate = await page.evaluate(linkedinExperienceGate);
    check();
    if (gate.draft && !gate.wall) {
      throw linkedinPositionFailure('owner-draft');
    }
    if (
      page === session.page &&
      gate.url !== 'about:blank' &&
      !gate.url.startsWith(root)
    ) {
      throw linkedinPositionFailure('session');
    }
  }
};

const open = (session, url, signal) =>
  session.commander.goto({
    url,
    signal,
    waitUntil: 'domcontentloaded',
    waitForStableUrlBefore: false,
    waitForStableUrlAfter: false,
    waitForNetworkIdle: false,
    timeout: 30000,
  });

export const readLinkedinPositionExperience = async ({
  session,
  plan,
  signal,
  check,
  wait,
  now,
}) => {
  const options = { ...plan.target, signal };
  await open(session, options.url, signal);
  const deadline = now() + 30000;
  for (let attempt = 0; attempt < 60; attempt++) {
    const { ready, gate } = await linkedinSessionGate(
      session,
      options.url,
      check
    );
    if (gate.wall || gate.url !== options.url || now() >= deadline) {
      throw linkedinPositionFailure('session');
    }
    if (ready) {
      const raw = await traverseLinkedinExperience({
        session,
        options,
        check,
        wait,
        now,
        progress: async () => {},
      });
      return {
        document: linkedinExperienceDocument(
          raw,
          options,
          new Date(now()).toISOString()
        ),
        raw,
      };
    }
    await wait(500, signal);
  }
  throw linkedinPositionFailure('session');
};

const confirmFreshEditor = async (context) => {
  const { plan } = context;
  const { document } = await readLinkedinPositionExperience(context);
  const match =
    plan.operation === 'add'
      ? document.profile.positionEditor === plan.editor &&
        !document.jobs.some(
          (job) =>
            job.company === plan.desired.company &&
            job.title === plan.desired.title &&
            job.start === plan.desired.start
        )
      : document.jobs.some(
          ({ native }) => native.positionEditor === plan.editor
        );
  if (!match) {
    throw linkedinPositionFailure('editor');
  }
  return document;
};

const waitForEditor = async ({ form, check, wait, now, signal }) => {
  const deadline = now() + 30000;
  for (let attempt = 0; attempt < 60; attempt++) {
    const state = await form.read();
    if (attempt === 0 && process.env.MS_CV_LINKEDIN_DEBUG === '1') {
      console.error({ event: 'linkedin-position-form', state: state.state });
    }
    if (state.state === 'ready') {
      return state.controls;
    }
    if (state.state !== 'missing' || now() >= deadline) {
      break;
    }
    await wait(500, signal);
    check();
  }
  throw linkedinPositionFailure('form');
};

/** Native preparation holds the same isolated profile lease as experience acquisition. */
export const createLinkedinPositionNative =
  ({
    store,
    openSession = openBrowserSession,
    profileDir = defaultProfileDir('linkedin', 'linkedin-experience'),
    wait = (ms, signal) => delay(ms, undefined, { signal }),
    now = Date.now,
  }) =>
  async (plan, signal, withPrepared) => {
    const check = () => signal?.throwIfAborted();
    check();
    const lease = await acquireStoreLock(profileDir, { exclusive: true });
    let session;
    try {
      check();
      session = await openSession({
        store,
        platform: 'linkedin',
        slot: plan.browserSlot,
        useCase: 'cv',
        headless: false,
        persistent: true,
        profileDir,
        signal,
        locale: plan.target.language === 'ru' ? 'ru-RU' : 'en-US',
      });
      check();
      await clearSlot(session, plan.target.url, check);
      if (!(await signedIn(session))) {
        throw linkedinPositionFailure('login-required');
      }
      check();
      const before = await confirmFreshEditor({
        session,
        plan,
        signal,
        check,
        wait,
        now,
      });
      const eligible = await readLinkedinProfileSkills({
        session,
        plan,
        check,
        wait,
        signal,
      });
      if (!eligible.length && !plan.media && !Object.keys(plan.fields).length) {
        return {
          phase: 'no-changes',
          code: 'cv-linkedin-position-note',
          unapplied: ['skills'],
          unresolvedSkills: plan.skills,
        };
      }
      await clearSlot(session, plan.target.url, check);
      await open(session, plan.editor, signal);
      const token = randomUUID();
      const form = linkedinPositionForm({ session, plan, token, check });
      const controls = await waitForEditor({ form, check, wait, now, signal });
      if (!(await signedIn(session))) {
        throw linkedinPositionFailure('login-required');
      }
      const draft = await fillLinkedinPosition(form, controls, plan);
      check();
      const skills = await fillLinkedinPositionSkills({
        session,
        plan,
        token,
        eligible,
        form,
        controls: draft,
        check,
        wait,
        signal,
      });
      return await withPrepared({
        session,
        token,
        form,
        controls: draft,
        before,
        skills,
        check,
        wait,
        now,
        signal,
      });
    } finally {
      try {
        await detach(session);
      } finally {
        lease.release();
      }
    }
  };
