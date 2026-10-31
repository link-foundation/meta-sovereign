// Which Telegram account the page is using, and which requests belong to
// it (R-Y202; learned, never copied: Telegram Desktop switches its whole
// window to the account chosen in the main menu).
//
// The choice is kept per tab in sessionStorage (a new tab starts on
// account 1, as ever). A request for an extra account (2..5) names it in
// `telegramAccount=N` of its query; the server then answers from that
// account's own store and connection. Only the paths in `scopedForExtra`
// belong to an account; the server refuses an extra account on any other
// path, and the page never adds one to them. This module is shared by the
// page and the server, so both agree on that list.

export const ACCOUNT_PARAM = 'telegramAccount';
export const ACCOUNT_HEADER = 'x-telegram-account';
export const ACCOUNT_KEY = 'metaSovereignTelegramAccount';

const MAX_SLOT = 5;

// The account-global Telegram routes: they name an account in their body
// (or list all of them), so an account in the query is refused there.
const GLOBAL_TELEGRAM = /^\/api\/telegram\/accounts(-|$)/;
const ALWAYS_GET = [
  /^\/links(\/[^/]+)?$/,
  /^\/api\/chat\//,
  /^\/api\/feedback(?:\/|$)/,
  /^\/api\/media\/history\//,
  /^\/api\/events$/,
  /^\/api\/status$/,
  /^\/api\/contacts$/,
  /^\/api\/typing$/,
  /^\/api\/message\/supports$/,
  /^\/api\/people\/(learned|learning-settings)$/,
  /^\/api\/suggest(?:\/(model|stats|library))?$/,
];
const POSTS = [
  /^\/api\/send$/,
  /^\/api\/typing$/,
  /^\/api\/message\//,
  /^\/api\/people\/learning-settings$/,
  /^\/api\/feedback\/(collect|settings)$/,
  /^\/api\/suggest\/library-settings$/,
];

/** Whether a request of this path and method may be for an extra account. */
export const scopedForExtra = (path, method = 'GET') => {
  const verb = String(method).toUpperCase();
  if (path.startsWith('/api/telegram/')) {
    return !GLOBAL_TELEGRAM.test(path);
  }
  if (verb === 'GET') {
    return ALWAYS_GET.some((re) => re.test(path));
  }
  return verb === 'POST' && POSTS.some((re) => re.test(path));
};

const slotOf = (value) => {
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= MAX_SLOT ? slot : 1;
};

/** The account this tab uses: 1 unless another was chosen. */
export const activeAccount = (storage = globalThis.sessionStorage) => {
  try {
    return slotOf(storage?.getItem(ACCOUNT_KEY));
  } catch {
    return 1;
  }
};

/** Remember the tab's account (the page then reloads its data). */
export const setActiveAccount = (slot, storage = globalThis.sessionStorage) => {
  try {
    if (slotOf(slot) === 1) {
      storage?.removeItem(ACCOUNT_KEY);
    } else {
      storage?.setItem(ACCOUNT_KEY, String(slotOf(slot)));
    }
  } catch {
    // Storage blocked: the page stays on the account it has.
  }
};

/**
 * `url` (a path or an absolute URL) with the account named in its query,
 * when the tab uses an extra account and the path belongs to one.
 */
export const scopedUrl = (url, method = 'GET', slot = activeAccount()) => {
  if (slot < 2 || typeof url !== 'string') {
    return url;
  }
  let parsed;
  try {
    parsed = new URL(url, 'http://local.invalid');
  } catch {
    return url;
  }
  if (!scopedForExtra(parsed.pathname, method)) {
    return url;
  }
  parsed.searchParams.set(ACCOUNT_PARAM, String(slot));
  const tail = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? parsed.toString() : tail;
};
