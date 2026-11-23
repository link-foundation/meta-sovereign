import { randomUUID } from 'node:crypto';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { linkedinExperienceGate } from './linkedin-experience-dom.js';
import { linkedinSessionGate } from './linkedin-experience-session.js';
import {
  createLinkedinReviewSession,
  linkedinReviewSignedIn,
  openLinkedinReviewPage,
} from './linkedin-position-native.js';
import { inspectLinkedinAboutForm } from './linkedin-about-dom.js';
import { scanLinkedinProfileAbout } from './linkedin-profile-dom.js';

export const linkedinAboutFailure = (reason) =>
  Object.assign(new Error('LinkedIn About review could not be confirmed.'), {
    code: `cv-linkedin-about-${reason}`,
    status: reason === 'stopped' ? 503 : 409,
  });

export const linkedinAboutText = (text) => text.replace(/\r\n?/gu, '\n').trim();

const editorUrl = (href, profile) => {
  try {
    const root = new URL(profile);
    const url = new URL(href);
    if (
      url.origin === root.origin &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname.startsWith(root.pathname) &&
      /^(?:edit\/forms\/(?:about|summary)|add-edit\/(?:ABOUT|SUMMARY))\/?$/u.test(
        url.pathname.slice(root.pathname.length)
      ) &&
      url.searchParams.size <= 1 &&
      [...url.searchParams].every(
        ([key, value]) =>
          key === 'profileFormEntryPoint' && /^[A-Z_]{1,60}$/u.test(value)
      )
    ) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
};

const profileOf = ({ target }) =>
  target.url.replace(/details\/experience\/$/u, '');

const navigating = (error) =>
  /execution context was destroyed|cannot find context with specified id/iu.test(
    error.message
  );

const readProfile = async ({ session, now, check, wait, signal }, url) => {
  const { page } = session;
  const deadline = now() + 30000;
  let previous = null;
  for (let attempt = 0; attempt < 60 && now() < deadline; attempt++) {
    check();
    const { ready, gate } = await linkedinSessionGate(session, url, check);
    if (gate.wall || gate.url !== url) {
      throw linkedinAboutFailure('session');
    }
    if (ready) {
      const result = await page.evaluate(scanLinkedinProfileAbout, {
        url,
        expand: true,
        scroll: true,
        editor: true,
      });
      check();
      if (result.blocked) {
        throw linkedinAboutFailure('profile');
      }
      if (!result.busy && !result.more && (result.observed || result.bottom)) {
        const signature = JSON.stringify([result.about, result.editor]);
        if (signature === previous) {
          return result;
        }
        previous = signature;
      } else {
        previous = null;
      }
    }
    await wait(500, signal);
  }
  throw linkedinAboutFailure('profile');
};

const freshProfile = async (context, profile) => {
  const page = await context.session.page.context().newPage();
  try {
    context.check();
    await page.goto(profile, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const observation = await readProfile(
      {
        ...context,
        session: {
          page,
          commander: {
            evaluate: ({ fn, args }) => page.evaluate(fn, args[0]),
          },
        },
      },
      profile
    );
    const capturedAt = new Date(context.now()).toISOString();
    return { observation, capturedAt };
  } finally {
    const gate = await page.evaluate(linkedinExperienceGate).catch(() => null);
    if (gate && (!gate.draft || gate.wall)) {
      await page.close();
    }
  }
};

const createForm = (context, profile, editor) => {
  const { session, check } = context;
  const token = randomUUID();
  return async (expected, action) => {
    check();
    const { page } = session;
    if (page.isClosed()) {
      return { state: 'closed' };
    }
    const url = page.url();
    if (
      url !== profile &&
      (editor === 'button' ? !editorUrl(url, profile) : url !== editor)
    ) {
      return { state: 'away' };
    }
    if (!(await linkedinReviewSignedIn(session))) {
      throw linkedinAboutFailure('login-required');
    }
    check();
    try {
      return await page.evaluate(inspectLinkedinAboutForm, {
        url,
        token,
        expected,
        action,
      });
    } catch (error) {
      check();
      if (page.isClosed()) {
        return { state: 'closed' };
      }
      if (navigating(error)) {
        return { state: 'navigating' };
      }
      throw error;
    }
  };
};

const waitForForm = async ({ wait, now, signal }, read) => {
  const deadline = now() + 30000;
  for (let attempt = 0; attempt < 60 && now() < deadline; attempt++) {
    const result = await read();
    if (result.state === 'ready') {
      return result;
    }
    if (!['missing', 'navigating'].includes(result.state)) {
      break;
    }
    await wait(500, signal);
  }
  throw linkedinAboutFailure('form');
};

const prepare = async (context, plan, profile) => {
  const { session, signal, check } = context;
  await openLinkedinReviewPage(session, profile, signal);
  const before = await readProfile(context, profile);
  if (!before.observed || before.about !== plan.before) {
    throw linkedinAboutFailure('baseline');
  }
  const editor =
    before.editor === 'button'
      ? before.editor
      : editorUrl(before.editor, profile);
  if (!editor) {
    throw linkedinAboutFailure('editor');
  }
  check();
  if (!(await linkedinReviewSignedIn(session))) {
    throw linkedinAboutFailure('login-required');
  }
  const opened = await session.page
    .evaluate(scanLinkedinProfileAbout, {
      url: profile,
      open: { before: plan.before, editor },
    })
    .catch((error) => {
      if (!navigating(error)) {
        throw error;
      }
      // The click may replace the document before its result reaches us.
      return { opened: session.page.url() === editor };
    });
  check();
  if (!opened.opened) {
    throw linkedinAboutFailure('editor');
  }
  const read = createForm(context, profile, editor);
  const form = await waitForForm(context, read);
  if (
    linkedinAboutText(form.value) !== plan.before ||
    (form.limit >= 0 && plan.after.length > form.limit)
  ) {
    throw linkedinAboutFailure('baseline');
  }
  const applied = await read(form.value, {
    kind: 'prepare',
    value: plan.after,
  });
  const prepared = await read();
  if (
    applied.state !== 'prepared' ||
    !prepared.owned ||
    prepared.changed ||
    prepared.value !== plan.after
  ) {
    throw linkedinAboutFailure('draft');
  }
  return read;
};

export const createLinkedinAboutNative = (options) => {
  const withSession = createLinkedinReviewSession({
    ...options,
    failure: linkedinAboutFailure,
  });
  return (plan, signal, withPrepared) =>
    withSession(plan, signal, async (context) => {
      const profile = profileOf(plan);
      const read = await prepare(context, plan, profile);
      const verify = async () => {
        const { observation, capturedAt } = await freshProfile(
          context,
          profile
        );
        if (
          !observation.observed ||
          observation.url !== profile ||
          observation.about !== plan.after
        ) {
          throw linkedinAboutFailure('readback');
        }
        const saved = {
          evidence: 'verified-linkedin-about-profile',
          source: plan.target,
          about: observation.about,
          capturedAt,
        };
        return { ...saved, sha256: await modelFingerprint(saved) };
      };
      const { now, wait } = context;
      return withPrepared({ read, verify, now, wait, signal });
    });
};
