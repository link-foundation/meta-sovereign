import { setTimeout as delay } from 'node:timers/promises';
import { cvWatchUrl } from './cv-watch-browser.js';
import { cvPrepareFailure } from './cv-prepare-record.js';
import { traceCvWatch } from './cv-watch-trace.js';
import { cvWorkplaceCreatesRecord } from './cv-workplace-membership.js';

export const cvWorkplaceEditorUrl = (value, recordId, hash) => {
  let url;
  try {
    url = cvWatchUrl(value);
  } catch {
    return false;
  }
  return (
    url.pathname ===
      `/profile/edit/experience${recordId === null ? '' : `/${recordId}`}` &&
    (recordId !== null || url.searchParams.get('resumeFrom') === hash) &&
    !url.hash &&
    new Set(url.searchParams.keys()).size === [...url.searchParams].length &&
    [...url.searchParams].every(
      ([key, val]) =>
        (key === 'resumeFrom' && val === hash) ||
        (key === 'hhtmFrom' && val === 'resume')
    )
  );
};

/** Bounded list inspection. Never click, navigate, hide or clear an owner draft. */
export const readCvWorkplaceNavigation = ({ recordId, job, hash }) => {
  const doc = globalThis.document;
  const visible = (node) =>
    node.getClientRects().length &&
    !node.closest('[hidden],[inert],[aria-hidden="true"]') &&
    globalThis.getComputedStyle(node).visibility !== 'hidden';
  const open = Boolean(
    doc.querySelector(
      'input[name="position"],input[name="company"],textarea[data-qa="resume-editor-about"],[data-qa="resume-partial-edit-save"],[data-qa="profile-layout-save-button"]'
    )
  );
  const challenge = Boolean(
    doc.querySelector(
      'input[name*="captcha"],.smart-captcha,[data-smartcaptcha],.g-recaptcha,.h-captcha,.cf-turnstile,[data-qa="account-login-form"]'
    )
  );
  const dialogs = [...doc.querySelectorAll('[role="dialog"]')].some(visible);
  const adding = recordId === null;
  const selector = adding
    ? 'main [data-qa="list-add"]'
    : 'main [data-qa^="edit-experience-button-"],main a[href*="/profile/edit/experience/"]';
  const controls = [...doc.querySelectorAll(selector)];
  if (controls.length > 1000) {
    return { open, challenge, dialogs, overflow: true };
  }
  const norm = (text) => text.replace(/\s+/gu, ' ').trim();
  const nativeHref = (href) => {
    const url = new URL(href, globalThis.location.href);
    return (
      url.origin === 'https://hh.ru' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname ===
        `/profile/edit/experience${adding ? '' : `/${recordId}`}` &&
      (!adding || url.searchParams.get('resumeFrom') === hash) &&
      new Set(url.searchParams.keys()).size === [...url.searchParams].length &&
      [...url.searchParams].every(
        ([key, value]) =>
          (key === 'resumeFrom' && value === hash) ||
          (key === 'hhtmFrom' && value === 'resume')
      )
    );
  };
  const parts = adding
    ? []
    : [job.company, job.position, job.description].map(norm);
  const cardMatches = (node) => {
    let card = node.parentElement;
    for (let depth = 0; card && card !== doc.body && depth < 30; depth++) {
      if (
        controls.filter((other) => card.contains(other)).length > 1 ||
        card.textContent.length > 128000
      ) {
        return false;
      }
      const text = norm(card.textContent);
      if (parts.every((part) => text.includes(part))) {
        return true;
      }
      card = card.parentElement;
    }
    return false;
  };
  const handlerReady = (node) => {
    const props =
      node[Object.keys(node).find((key) => key.startsWith('__reactProps$'))];
    return (
      typeof props?.onClick === 'function' || typeof node.onclick === 'function'
    );
  };
  const candidates = [];
  for (const [index, node] of controls.entries()) {
    if (
      !visible(node) ||
      node.disabled ||
      node.getAttribute('aria-disabled') === 'true'
    ) {
      continue;
    }
    const href = node.getAttribute('href');
    if (href && !nativeHref(href)) {
      continue;
    }
    if (
      adding
        ? /^(add|добавить)/iu.test(norm(node.textContent))
        : cardMatches(node)
    ) {
      candidates.push({ index, ready: Boolean(href || handlerReady(node)) });
    }
  }
  return {
    open,
    challenge,
    dialogs,
    selector,
    candidates,
    ready: doc.readyState !== 'loading',
  };
};

const waitForNativeWorkplaceControl = async (read, readinessMs) => {
  const deadline = Date.now() + readinessMs;
  let selected;
  do {
    const state = await read();
    if (state.ready && state.candidates.length > 1) {
      throw cvPrepareFailure('baseline');
    }
    if (
      state.ready &&
      state.candidates.length === 1 &&
      state.candidates[0].ready
    ) {
      selected = state;
      break;
    }
    await delay(50);
  } while (Date.now() < deadline);
  if (!selected) {
    throw cvPrepareFailure('hydration');
  }
  return selected;
};

/** Explicit preparation may open the exact reviewed job; every Save stays with the owner. */
export const openNativeCvWorkplace = async ({
  session,
  change,
  check,
  phase,
  readinessMs = 20000,
}) => {
  const { page, commander } = session;
  const { job } = change.workplace;
  const recordId = cvWorkplaceCreatesRecord(change.plan?.operation)
    ? null
    : change.workplace.recordId;
  if (
    recordId !== null &&
    cvWorkplaceEditorUrl(page.url(), recordId, change.hash)
  ) {
    return;
  }
  const read = async () => {
    check();
    cvWatchUrl(page.url());
    const state = await commander.evaluate({
      fn: readCvWorkplaceNavigation,
      args: [{ recordId, job, hash: change.hash }],
    });
    check();
    if (state.open || state.dialogs || state.challenge || state.overflow) {
      throw cvPrepareFailure(state.challenge ? 'page' : 'draft');
    }
    return state;
  };
  await read();
  await phase('opening');
  await read();
  const list = `https://hh.ru/profile/edit/experience?resumeFrom=${encodeURIComponent(change.hash)}&hhtmFrom=resume`;
  if (page.url() !== list) {
    await page.goto(list, { waitUntil: 'domcontentloaded', timeout: 20000 });
  }
  check();
  if (page.url() !== list) {
    throw cvPrepareFailure('page');
  }
  const selected = await waitForNativeWorkplaceControl(read, readinessMs);
  const index = selected.candidates[0].index;
  const control = await page
    .locator(selected.selector)
    .nth(index)
    .elementHandle();
  if (!control) {
    throw cvPrepareFailure('baseline');
  }
  try {
    const fresh = await read();
    if (
      page.url() !== list ||
      JSON.stringify(fresh.candidates) !==
        JSON.stringify(selected.candidates) ||
      !(await control.evaluate(
        (node, { selector, index }) =>
          node.isConnected &&
          node === globalThis.document.querySelectorAll(selector)[index],
        { selector: selected.selector, index }
      ))
    ) {
      throw cvPrepareFailure('draft');
    }
    check();
    await control.click({ timeout: 10000 });
    await page.waitForURL(
      (url) => cvWorkplaceEditorUrl(url.href, recordId, change.hash),
      { timeout: readinessMs }
    );
    if (recordId === null) {
      await page
        .locator('input[name="position"]')
        .waitFor({ timeout: readinessMs });
      if (!cvWorkplaceEditorUrl(page.url(), recordId, change.hash)) {
        throw cvPrepareFailure('page');
      }
    }
    check();
    traceCvWatch('workplace-opened', { state: 'opening' });
  } finally {
    await control.dispose();
  }
};
