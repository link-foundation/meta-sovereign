import { isDeepStrictEqual } from 'node:util';
import { modelFingerprint } from '../automation/answer-model-context.js';
import { linkedinExperienceGate } from './linkedin-experience-dom.js';
import { readLinkedinPositionExperience } from './linkedin-position-native.js';
import { linkedinPositionValues } from './linkedin-position-plan.js';

/** A form closing alone is not an acknowledgement from LinkedIn. */
const scanOutcome = ({ editor, profile, token, discard }) => {
  const { document, location } = globalThis;
  if (
    !location.href.startsWith(profile) ||
    document.querySelector('input[type="password"], input[name="session_key"]')
  ) {
    return discard ? false : 'away';
  }
  const onScreen = (node) => Boolean(node.getClientRects().length);
  const dialogs = [
    ...document.querySelectorAll('dialog[open], [role="dialog"]'),
  ].filter(onScreen);
  const warnings = dialogs.filter((node) =>
    [...node.querySelectorAll('h1, h2, h3, [role="heading"]')].some(
      (heading) =>
        onScreen(heading) &&
        /^(?:discard changes|отменить изменения|отклонить изменения)\??$/iu.test(
          heading.textContent.trim()
        )
    )
  );
  if (discard) {
    const requested = document.__metaSovereignPositionDiscard;
    if (
      location.href !== editor ||
      warnings.length !== 1 ||
      requested?.__metaSovereignPosition !== token ||
      requested.__metaSovereignPositionEdited
    ) {
      return false;
    }
    const buttons = [...warnings[0].querySelectorAll('button')].filter(
      (button) =>
        onScreen(button) &&
        !button.disabled &&
        button.getAttribute('aria-disabled') !== 'true' &&
        /^(?:discard|отменить|отклонить|не сохранять)$/iu.test(
          (button.getAttribute('aria-label') ?? button.textContent).trim()
        )
    );
    if (buttons.length !== 1) {
      return false;
    }
    delete document.__metaSovereignPositionDiscard;
    buttons[0].click();
    return true;
  }
  if (location.href === editor && warnings.length) {
    return 'discard';
  }
  if (
    location.href === editor &&
    dialogs.some((node) => node.__metaSovereignPosition === token)
  ) {
    return 'open';
  }
  const confirmed = [
    ...document.querySelectorAll('[role="status"], [role="alert"]'),
  ].some(
    (node) =>
      onScreen(node) &&
      /^(?:your experience is saved|ваш опыт сохранен|ваш опыт сохранён)[.!]?$/iu.test(
        node.textContent.trim()
      )
  );
  if (
    confirmed ||
    location.pathname.replace(/\/$/u, '') ===
      new URL('edit/forms/next-action', profile).pathname
  ) {
    return 'confirmed';
  }
  return dialogs.length ? 'dialog' : 'closed';
};

export const linkedinPositionOutcome = async (
  { session, plan, token, check },
  discard = false
) => {
  check();
  try {
    const result = await session.page.evaluate(scanOutcome, {
      editor: plan.editor,
      profile: plan.target.url.replace(/details\/experience\/$/u, ''),
      token,
      discard,
    });
    check();
    return result;
  } catch (error) {
    check();
    if (session.page.isClosed()) {
      return discard ? false : 'closed';
    }
    if (
      /execution context was destroyed|cannot find context with specified id/iu.test(
        error.message
      )
    ) {
      return discard ? false : 'navigating';
    }
    throw error;
  }
};

const freshObservation = async (context) => {
  const page = await context.session.page.context().newPage();
  try {
    context.check();
    return await readLinkedinPositionExperience({
      ...context,
      session: {
        page,
        commander: {
          goto: ({ url, waitUntil, timeout }) =>
            page.goto(url, { waitUntil, timeout }),
          evaluate: ({ fn, args }) => page.evaluate(fn, args?.[0]),
        },
      },
    });
  } finally {
    const gate = await page.evaluate(linkedinExperienceGate).catch(() => null);
    if (gate && (!gate.draft || gate.wall)) {
      await page.close();
    }
  }
};

const positionInNewExport = (plan, before, document) => {
  if (plan.operation === 'update' && !Object.keys(plan.fields).length) {
    return null;
  }
  const oldEditors = new Set(
    before.jobs.map((job) => job.native.positionEditor)
  );
  const sameEditor = (editor) =>
    plan.operation === 'update'
      ? editor === plan.editor
      : editor && !oldEditors.has(editor);
  const candidates = document.jobs.filter(
    (job) =>
      sameEditor(job.native.positionEditor) &&
      isDeepStrictEqual(linkedinPositionValues(job), plan.desired)
  );
  return candidates.length === 1 ? candidates[0] : null;
};

export const verifyLinkedinPositionSave = async (context) => {
  const { document, raw } = await freshObservation(context);
  const job = positionInNewExport(context.plan, context.before, document);
  if (!job) {
    return null;
  }
  return {
    evidence: 'verified-linkedin-position-export',
    sha256: await modelFingerprint(raw),
    source: document.source,
    editor: job.native.positionEditor,
    values: linkedinPositionValues(job),
  };
};
