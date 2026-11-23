import { evaluateLinkedin } from './linkedin-experience-session.js';
import { inspectLinkedinPositionMedia } from './linkedin-position-media-dom.js';
import { linkedinPositionFailure } from './linkedin-position-plan.js';

const issue = () => linkedinPositionFailure('media-review');
const waitForMedia = async ({
  read,
  state,
  action = 'scan',
  wait,
  signal,
  passes = 12,
}) => {
  for (let pass = 0; pass < passes; pass++) {
    const result = await read({ kind: action });
    if (result.state === state) {
      return result;
    }
    await wait(300, signal);
  }
  throw issue();
};

const typeMedia = async ({ read, wait, signal }, kind, initial, value) => {
  if (initial === value) {
    return;
  }
  let previous = initial;
  let next = '';
  for (const character of value) {
    const replace = !next;
    next += character;
    const result = await read({ kind, expected: previous, character, replace });
    if (result.state !== 'typed' || result.value !== next) {
      throw issue();
    }
    previous = next;
    await wait(25, signal);
  }
};

/** Attach the exact link inside the draft. The position's Save stays with its owner. */
export const fillLinkedinPositionMedia = async ({
  session,
  plan,
  token,
  form,
  controls,
  check,
  wait,
  signal,
}) => {
  const { media } = plan;
  if (!media) {
    return { applied: null, unresolved: false };
  }
  let lastScan;
  const read = async (action) => {
    check();
    const result = await evaluateLinkedin(
      session,
      inspectLinkedinPositionMedia,
      [{ url: plan.editor, token, media, action }]
    );
    check();
    if (
      process.env.MS_CV_LINKEDIN_DEBUG === '1' &&
      !action.kind.startsWith('type-') &&
      (action.kind !== 'scan' || lastScan !== result.state)
    ) {
      lastScan = result.state;
      console.error({
        event: 'linkedin-position-media',
        action: action.kind,
        state: result.state,
      });
    }
    if (result.state === 'conflict') {
      throw linkedinPositionFailure('owner-draft');
    }
    return result;
  };
  const run = { read, wait, signal };
  const start = await read({ kind: 'scan' });
  if (start.state !== 'available') {
    return { applied: null, unresolved: start.state !== 'present' };
  }
  if ((await read({ kind: 'open' })).state !== 'clicked') {
    throw issue();
  }
  await waitForMedia({ ...run, action: 'choose', state: 'clicked' });
  const input = await waitForMedia({ ...run, state: 'url' });
  if (input.value !== '') {
    throw linkedinPositionFailure('owner-draft');
  }
  await typeMedia(run, 'type-url', input.value, media.url);
  await waitForMedia({ ...run, action: 'preview', state: 'clicked' });
  const preview = await waitForMedia({ ...run, state: 'preview', passes: 50 });
  await typeMedia(run, 'type-title', preview.value, media.title);
  if ((await read({ kind: 'attach' })).state !== 'clicked') {
    throw issue();
  }
  const confirm = async () => {
    const result = await waitForMedia({ ...run, state: 'present' });
    const formState = await form.read();
    if (
      !result.exactTitle ||
      !formState.owned ||
      formState.ownerChanged ||
      JSON.stringify(formState.controls) !== JSON.stringify(controls)
    ) {
      throw issue();
    }
  };
  await confirm();
  return { applied: media, unresolved: false, confirm };
};
