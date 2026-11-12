import { setTimeout as delay } from 'node:timers/promises';
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
  const editor = page.locator('textarea[data-qa="resume-editor-about"]');
  const handle = await editor.elementHandle();
  if (!handle) {
    throw cvPrepareFailure('draft');
  }
  try {
    const unchanged = async (expected, focused = false, controlled = true) => {
      const state = await read();
      const same = await handle.evaluate(
        (node, focused) =>
          node.isConnected &&
          node ===
            globalThis.document.querySelector(
              'textarea[data-qa="resume-editor-about"]'
            ) &&
          (!focused || node === globalThis.document.activeElement),
        focused
      );
      check();
      if (
        !same ||
        state.foreign ||
        !state.writable ||
        state.about !== expected ||
        (controlled && state.controlledValue !== expected)
      ) {
        throw cvPrepareFailure('draft');
      }
    };
    await handle.focus();
    await delay(settleMs);
    await unchanged(before.about, true);
    await phase('preparing');
    await unchanged(before.about, true);
    await handle.press('ControlOrMeta+A', { timeout: 10000 });
    await unchanged(before.about, true);
    await page.keyboard.insertText(change.after);
    await unchanged(change.after, true, false);
    // A native change after bulk insertion settles HH's controlled textarea.
    // At maxlength, remove/restore one complete code point instead of overflowing.
    if (
      before.maxLength >= 0 &&
      change.after.length === before.maxLength &&
      change.after.length
    ) {
      const last = Array.from(change.after).at(-1);
      await handle.evaluate(
        (node, size) =>
          node.setSelectionRange(node.value.length - size, node.value.length),
        last.length
      );
      check();
      await handle.press('Backspace', { timeout: 10000 });
      await unchanged(change.after.slice(0, -last.length), true, false);
      await page.keyboard.insertText(last);
    } else {
      await handle.press('Space', { timeout: 10000 });
      await unchanged(`${change.after} `, true, false);
      await handle.press('Backspace', { timeout: 10000 });
    }
    await wait(
      (state) =>
        state.about === change.after && state.controlledValue === change.after
    );
    await editor.blur();
    await delay(settleMs);
    await unchanged(change.after);
    traceCvWatch('about-prepared', { state: 'prepared' });
  } finally {
    await handle.dispose();
  }
};
