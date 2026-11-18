import { fetchCvSavedHtml } from './cv-watch-export.js';
import { jobsFailure } from './options.js';
import { traceCvWatch } from './cv-watch-trace.js';

const unavailable = () =>
  jobsFailure(
    'cv-record',
    'The new saved workplace identity was not confirmed.'
  );

/** Inert complete-list read. Script state and translated card text cannot identify records. */
export const readCvWorkplaceListDocument = (html) => {
  const doc = new globalThis.DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelectorAll('main');
  if (
    main.length !== 1 ||
    main[0].querySelectorAll('[data-qa="list-add"]').length !== 1 ||
    doc.querySelector(
      'input[name*="captcha"],.smart-captcha,[data-smartcaptcha],.g-recaptcha,.h-captcha,.cf-turnstile,[data-qa="account-login-form"],input[name="position"],textarea[data-qa="resume-editor-about"],[data-qa="pager-next"],a[rel="next"],[aria-busy="true"]'
    )
  ) {
    return null;
  }
  const controls = [...main[0].querySelectorAll('a,button')].filter(
    (node) =>
      node.matches(
        '[data-qa^="edit-experience-button-"],a[href*="/profile/edit/experience/"]'
      ) || /^(edit|редактировать)$/iu.test(node.textContent.trim())
  );
  if (controls.length > 1000) {
    return null;
  }
  const ids = [];
  for (const control of controls) {
    const href = control.getAttribute('href');
    if (!href) {
      return null;
    }
    let url;
    try {
      url = new URL(href, 'https://hh.ru/profile/edit/experience');
    } catch {
      return null;
    }
    const id = url.pathname.match(
      /^\/profile\/edit\/experience\/(\d{1,100})\/?$/u
    )?.[1];
    if (
      !id ||
      url.origin !== 'https://hh.ru' ||
      url.username ||
      url.password ||
      url.hash ||
      new Set(url.searchParams.keys()).size !== [...url.searchParams].length ||
      [...url.searchParams].some(
        ([key, value]) =>
          !(
            (key === 'resumeFrom' && /^[a-zA-Z\d_-]{1,100}$/u.test(value)) ||
            (key === 'hhtmFrom' && value === 'resume')
          )
      )
    ) {
      return null;
    }
    ids.push(id);
  }
  return new Set(ids).size === ids.length ? ids.sort() : null;
};

export const readCvSavedWorkplaceIds = async ({ session, check }) => {
  check();
  const html = await session.commander.evaluate({
    fn: fetchCvSavedHtml,
    args: [{ workplaceList: true }],
  });
  check();
  if (typeof html !== 'string' || Buffer.byteLength(html) > 2 * 1024 ** 2) {
    throw unavailable();
  }
  const ids = await session.commander.evaluate({
    fn: readCvWorkplaceListDocument,
    args: [html],
  });
  check();
  traceCvWatch('workplace-list-read', {
    parsed: Array.isArray(ids),
    records: Array.isArray(ids) ? ids.length : 0,
  });
  return confirmedCvWorkplaceIds(ids);
};

export const confirmedCvWorkplaceIds = (ids) => {
  if (
    !Array.isArray(ids) ||
    ids.length > 1000 ||
    ids.some((id) => typeof id !== 'string' || !/^\d{1,100}$/u.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw unavailable();
  }
  return [...ids].sort();
};

/** A newly saved identity must be additional to the complete pre-Save list. */
export const createdCvWorkplaceAttempt = (attempt, before, after) => {
  before = confirmedCvWorkplaceIds(before);
  after = confirmedCvWorkplaceIds(after);
  const added = after.filter((id) => !before.includes(id));
  traceCvWatch('workplace-created-identity', {
    before: before.length,
    after: after.length,
    added: added.length,
    removed: before.filter((id) => !after.includes(id)).length,
  });
  if (
    attempt.recordId !== null ||
    added.length !== 1 ||
    before.some((id) => !after.includes(id))
  ) {
    throw unavailable();
  }
  return { ...attempt, recordId: added[0] };
};
