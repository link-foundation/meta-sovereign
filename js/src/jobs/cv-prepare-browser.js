import { setTimeout as delay } from 'node:timers/promises';
import { prepareCvControlledText } from './cv-prepare-text.js';
import { readCvAboutPreparation } from './cv-prepare-document.js';
import { cvWatchUrl } from './cv-watch-browser.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { traceCvWatch } from './cv-watch-trace.js';

const normalized = (text) =>
  text
    .replace(/\r/gu, '')
    .replace(/[^\S\n]+/gu, ' ')
    .trim();
/** Exact existing CV only. No navigation, cancellation or provider Save. */
export const prepareNativeCvAbout = async ({
  session,
  change,
  check,
  phase,
  readinessMs = 20000,
  settleMs = 750,
}) => {
  const { page, commander } = session;
  const read = async () => {
    check();
    cvWatchUrl(page.url());
    const state = await commander.evaluate({
      fn: readCvAboutPreparation,
      args: [],
    });
    check();
    if (state.hash !== change.hash || state.challenge) {
      throw cvPrepareFailure('page');
    }
    return state;
  };
  const wait = async (test) => {
    const deadline = Date.now() + readinessMs;
    do {
      const state = await read();
      if (test(state)) {
        return state;
      }
      await delay(50);
      check();
    } while (Date.now() < deadline);
    throw cvPrepareFailure('hydration');
  };
  if ((await read()).open) {
    throw cvPrepareFailure('draft');
  }
  await wait((state) => {
    if (state.open) {
      throw cvPrepareFailure('draft');
    }
    return state.ready && state.openerReady;
  });
  await phase('opening');
  if ((await read()).open) {
    throw cvPrepareFailure('draft');
  }
  await page
    .locator('[data-qa="resume-edit-button-about"]')
    .click({ timeout: 10000 });
  const before = await wait((state) => {
    if (state.foreign) {
      throw cvPrepareFailure('draft');
    }
    return state.aboutCount === 1 && state.controlled && state.writable;
  });
  if (
    normalized(before.about) !== normalized(change.before) ||
    before.controlledValue !== before.about ||
    (before.maxLength >= 0 && change.after.length > before.maxLength)
  ) {
    throw cvPrepareFailure('baseline');
  }
  await prepareCvControlledText({
    page,
    selector: 'textarea[data-qa="resume-editor-about"]',
    before: before.about,
    after: change.after,
    maxLength: before.maxLength,
    read: async (expected, controlled) => {
      const state = await read();
      return (
        !state.foreign &&
        state.writable &&
        state.about === expected &&
        (!controlled || state.controlledValue === expected)
      );
    },
    wait: () =>
      wait(
        (state) =>
          state.about === change.after && state.controlledValue === change.after
      ),
    check,
    phase,
    settleMs,
  });
  traceCvWatch('about-prepared', { state: 'prepared' });
};
