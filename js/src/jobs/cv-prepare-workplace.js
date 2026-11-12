import { setTimeout as delay } from 'node:timers/promises';
import { readCvEditorDocument } from './cv-watch-document.js';
import { readCvSavedWorkplace } from './cv-workplace-readback.js';
import {
  cvSaveAttempt,
  sameCvWorkplace,
  cvWorkplaceMatchesJob,
} from './cv-watch-verification.js';
import { prepareCvControlledText } from './cv-prepare-text.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { traceCvWatch } from './cv-watch-trace.js';

const selector =
  'textarea[data-qa="resume-editor-experience-description-input"]';
const readControl = () => {
  const doc = globalThis.document;
  const fields = [
    ...doc.querySelectorAll(
      'textarea[data-qa="resume-editor-experience-description-input"]'
    ),
  ].filter(
    (node) =>
      node.getClientRects().length &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]')
  );
  const node = fields.length === 1 ? fields[0] : null;
  const props =
    node?.[Object.keys(node).find((key) => key.startsWith('__reactProps$'))];
  return {
    ready: doc.readyState !== 'loading',
    challenge: Boolean(
      doc.querySelector('input[name*="captcha"],[data-qa="account-login-form"]')
    ),
    writable: Boolean(node && !node.disabled && !node.readOnly),
    controlled: typeof props?.onChange === 'function',
    value: typeof props?.value === 'string' ? props.value : null,
    maxLength: node?.maxLength ?? -1,
    foreign: Boolean(
      doc.querySelector(
        'textarea[data-qa="resume-editor-about"],[role="dialog"] [data-qa="profile-layout-save-button"]'
      )
    ),
  };
};

/** Already open exact record only. Owner Save, Cancel and every other field stay native. */
export const prepareNativeCvWorkplace = async ({
  session,
  change,
  check,
  phase,
  readinessMs = 20000,
  settleMs = 750,
}) => {
  const { recordId, job } = change.workplace;
  const read = async () => {
    check();
    const url = new URL(session.page.url());
    if (url.href !== `https://hh.ru/profile/edit/experience/${recordId}`) {
      throw cvPrepareFailure('page');
    }
    const raw = await session.commander.evaluate({
      fn: readCvEditorDocument,
      args: [],
    });
    check();
    const control = await session.commander.evaluate({
      fn: readControl,
      args: [],
    });
    check();
    if (raw?.kind !== 'workplace' || control.challenge || control.foreign) {
      throw cvPrepareFailure('draft');
    }
    return { form: cvSaveAttempt(raw), control };
  };
  const wait = async (accept) => {
    const deadline = Date.now() + readinessMs;
    do {
      const state = await read();
      if (accept(state)) {
        return state;
      }
      await delay(50);
      check();
    } while (Date.now() < deadline);
    throw cvPrepareFailure('hydration');
  };
  const { form: before, control } = await wait(
    ({ control }) => control.ready && control.controlled && control.writable
  );
  const selected = before.resumes.filter((row) => row.checked);
  if (selected.length !== 1 || selected[0].hash !== change.hash) {
    throw cvPrepareFailure('shared');
  }
  const saved = await readCvSavedWorkplace({ session, attempt: before, check });
  if (
    !sameCvWorkplace(before, saved) ||
    !cvWorkplaceMatchesJob(before, job, job.industries) ||
    before.description !== change.before ||
    control.value !== before.description ||
    (control.maxLength >= 0 && change.after.length > control.maxLength)
  ) {
    throw cvPrepareFailure('baseline');
  }
  const unchanged = async (expected, controlled = true) => {
    const state = await read();
    return (
      sameCvWorkplace({ ...before, description: expected }, state.form) &&
      state.form.description === expected &&
      state.control.writable &&
      state.control.controlled &&
      (!controlled || state.control.value === expected)
    );
  };
  if (!(await unchanged(before.description))) {
    throw cvPrepareFailure('draft');
  }
  await prepareCvControlledText({
    page: session.page,
    selector,
    before: before.description,
    after: change.after,
    maxLength: control.maxLength,
    read: unchanged,
    wait: () =>
      wait(({ form, control }) => {
        if (
          !sameCvWorkplace({ ...before, description: form.description }, form)
        ) {
          throw cvPrepareFailure('draft');
        }
        return (
          form.description === change.after && control.value === change.after
        );
      }),
    check,
    phase,
    settleMs,
  });
  traceCvWatch('workplace-prepared', { state: 'prepared' });
};
