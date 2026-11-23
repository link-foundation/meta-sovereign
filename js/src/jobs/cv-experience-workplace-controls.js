import { randomUUID } from 'node:crypto';
import { readCvEditorDocument } from './cv-watch-document.js';
import { cvPrepareFailure } from './cv-prepare-record.js';

const inspect = (read, { key, expected, action }) => {
  const doc = globalThis.document;
  const visible = (node) =>
    node.getClientRects().length &&
    !node.closest('[hidden],[inert],[aria-hidden="true"]') &&
    globalThis.getComputedStyle(node).visibility === 'visible';
  const all = (selector, root = doc) =>
    [...root.querySelectorAll(selector)].filter(visible);
  const usable = (node) =>
    !node.matches(':disabled,[aria-disabled="true"]') &&
    !node.closest('[aria-disabled="true"]');
  const discardButton = (dialog) => {
    const hasHeading = [
      dialog.getAttribute('aria-label'),
      ...all('h1,h2,h3,[role="heading"]', dialog).map(
        (node) => node.textContent
      ),
    ].some((text) =>
      /^(?:сохранить изменения|save changes)\s*[?？]?$/iu.test(
        text?.trim() ?? ''
      )
    );
    if (!hasHeading) {
      return null;
    }
    const buttons = all('button,[role="button"]', dialog).filter((node) =>
      /^(?:не надо|don['’]t(?: save)?|discard)$/iu.test(
        (node.getAttribute('aria-label') ?? node.textContent).trim()
      )
    );
    return buttons.length === 1 && usable(buttons[0]) ? buttons[0] : null;
  };
  const discardState = (dialogs, state, exactOrHidden) => {
    if (!(
      state?.skipping &&
      state.identity.isConnected &&
      exactOrHidden &&
      dialogs.length === 1
    )) {
      return 'changed';
    }
    const discard = discardButton(dialogs[0]);
    if (!discard) {
      return 'changed';
    }
    if (action === 'discard') {
      discard.click();
      return 'dispatched';
    }
    return 'discard';
  };
  const dialogs = all('[role="dialog"],dialog[open]');
  const state = globalThis[key];
  const actual = read();
  const form = all('input[name="company"]');
  if (actual?.kind === 'unavailable') {
    return 'unavailable';
  }
  const exact = JSON.stringify(actual) === JSON.stringify(expected);
  if (dialogs.length) {
    return discardState(dialogs, state, exact || actual === null);
  }
  if (!actual && !form.length && !state?.identity.isConnected) {
    return 'closed';
  }
  if (form.length !== 1 || state?.identity !== form[0] || !exact) {
    return 'changed';
  }
  if (!action) {
    return 'open';
  }
  if (action === 'discard') {
    return 'changed';
  }
  const selector =
    action === 'save'
      ? '[data-qa="profile-layout-save-button"],[data-qa="resume-partial-edit-save"]'
      : '[data-qa="profile-layout-cancel-button"],[data-qa="resume-partial-edit-cancel"]';
  const controls = all(selector);
  if (controls.length !== 1 || !usable(controls[0])) {
    return 'changed';
  }
  state.skipping = action === 'skip';
  controls[0].click();
  return 'dispatched';
};

/**
 * Read and act on the original filled form in the same browser turn. A
 * remounted editor or a changed value loses preparation authority.
 */
export const hhExperienceWorkplaceControls = async ({
  page,
  anchor,
  raw,
  hash,
  check,
}) => {
  const key = `__cv_experience_${randomUUID().replaceAll('-', '')}`;
  await anchor.evaluate((node, property) => {
    if (node.isConnected) {
      globalThis[property] = { identity: node, skipping: false };
    }
  }, key);
  const read = async (action) => {
    check();
    if (page.isClosed()) {
      return 'away';
    }
    const url = new URL(page.url());
    if (url.origin !== 'https://hh.ru' || url.username || url.password) {
      return 'away';
    }
    if (url.href !== raw.url) {
      if (action) {
        return 'away';
      }
      if (
        /^\/profile\/edit\/experience\/?$/u.test(url.pathname) ||
        url.pathname === `/resume/${hash}` ||
        url.pathname === '/applicant/resumes'
      ) {
        const current = await page.evaluate(readCvEditorDocument);
        check();
        return current === null && page.url() === url.href
          ? 'closed'
          : 'unavailable';
      }
      return 'away';
    }
    const state = await page.evaluate(
      `(${inspect.toString()})(${readCvEditorDocument.toString()},${JSON.stringify({ key, expected: raw, action })});`
    );
    check();
    return state;
  };
  if ((await read()) !== 'open') {
    throw cvPrepareFailure('draft');
  }
  return {
    read,
    close: () =>
      page
        .evaluate((property) => {
          delete globalThis[property];
        }, key)
        .catch(() => {}),
  };
};
