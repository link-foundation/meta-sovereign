import { setTimeout as delay } from 'node:timers/promises';

const hhOrigin = /^https:\/\/(?:www\.)?hh\.ru$/u;
const hhPageUrl = (page) => {
  if (!page || page.isClosed()) {
    return null;
  }
  const url = new URL(page.url());
  return hhOrigin.test(url.origin) && !url.username && !url.password
    ? url.href
    : null;
};

const signInState = () => {
  const doc = globalThis.document;
  const visible = (selector) =>
    [...doc.querySelectorAll(selector)].filter(
      (node) =>
        node.getClientRects().length &&
        !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
        globalThis.getComputedStyle(node).visibility === 'visible'
    );
  if (
    doc.readyState === 'loading' ||
    visible(
      'input[name*="captcha" i], .smart-captcha, [data-smartcaptcha], .g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="captcha" i]'
    ).length
  ) {
    return null;
  }
  const login = visible(
    '[data-qa="account-login-form"], [data-qa="account-login-submit"], form[action*="account/login"]'
  ).length;
  const account = visible(
    '[data-qa~="mainmenu_applicantProfile"], [data-qa~="mainmenu_applicantProfilePage"], [data-qa~="mainmenu_vacancyResponses"]'
  ).length;
  if (account && !login && !visible('a[data-qa="login"]').length) {
    return 'in';
  }
  if (
    login &&
    !account &&
    !visible(
      'input[type="email"], input[type="tel"], input[type="password"], input[type="text"], input:not([type]), input[autocomplete="one-time-code"]'
    ).some((field) => field.value !== '')
  ) {
    return 'out';
  }
  return null;
};

const untouchedLogin = async (page, url) => {
  const { pathname } = new URL(url);
  return (
    /^\/(?:account\/login|chat)\/?$/u.test(pathname) &&
    hhPageUrl(page) === url &&
    !page
      .context()
      .pages()
      .some((tab) => tab !== page && tab.url() !== 'about:blank') &&
    (await page.evaluate(signInState)) === 'out' &&
    hhPageUrl(page) === url
  );
};

const copySession = async ({
  source,
  sourceUrl,
  applicationPage,
  destination,
  targetUrl,
  signal,
}) => {
  const cookies = (
    await source
      .context()
      .cookies([
        'https://hh.ru/',
        'https://hh.ru/chat',
        'https://www.hh.ru/',
        'https://chatik.hh.ru/',
      ])
  ).filter(
    ({ domain, path, secure }) =>
      secure &&
      /^(?:\.)?(?:(?:www|chatik)\.)?hh\.ru$/iu.test(domain) &&
      path.startsWith('/')
  );
  if (
    !cookies.length ||
    cookies.length > 100 ||
    (await source.evaluate(signInState)) !== 'in' ||
    !(await untouchedLogin(destination, targetUrl)) ||
    applicationPage() !== source ||
    hhPageUrl(source) !== sourceUrl
  ) {
    return false;
  }
  signal.throwIfAborted();
  await destination.context().addCookies(cookies);
  return hhPageUrl(destination) === targetUrl;
};

/** Copy directly between the two owned contexts after checking both native pages. */
export const reuseApplicationChatSession = async ({
  applicationPage,
  destination,
  signal,
  waitMs = 60000,
}) => {
  if (!applicationPage) {
    return false;
  }
  const deadline = Date.now() + waitMs;
  try {
    const targetUrl = hhPageUrl(destination);
    if (!targetUrl || !(await untouchedLogin(destination, targetUrl))) {
      return false;
    }
    do {
      signal.throwIfAborted();
      const source = applicationPage();
      const sourceUrl = hhPageUrl(source);
      if (
        sourceUrl &&
        source.context() !== destination.context() &&
        (await source.evaluate(signInState)) === 'in'
      ) {
        return await copySession({
          source,
          sourceUrl,
          applicationPage,
          destination,
          targetUrl,
          signal,
        });
      }
      if (Date.now() >= deadline || hhPageUrl(destination) !== targetUrl) {
        return false;
      }
      await delay(250, undefined, { signal });
    } while (Date.now() <= deadline);
  } catch {
    // Keep errors from native cookie operations out of logs and public receipts.
    signal.throwIfAborted();
  }
  return false;
};
