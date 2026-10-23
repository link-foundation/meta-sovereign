// Opening Instant View from the page (R-Y205; learned, never copied): the
// link a click names (a `t.me/iv?url=…` link, or the link of a preview
// that has a cached page), and the event the reader's host listens to.

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const EVENT = 'ms-instant-view';
const MAX_URL = 2048;

const known = new Map(); // url -> how many previews show it

const httpOf = (text) => {
  try {
    const url = new URL(String(text ?? '').trim());
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.href.length <= MAX_URL
      ? url
      : null;
  } catch {
    return null;
  }
};

const keyOf = (url) => url.href.replace(/\/$/, '').toLowerCase();

/**
 * The page a link names: a `t.me/iv?url=…` link gives the url inside it,
 * else null (an ordinary link is no Instant View by itself).
 */
export const ivLinkTarget = (href) => {
  const link = httpOf(href);
  if (!link || !HOSTS.test(link.hostname) || link.pathname !== '/iv') {
    return null;
  }
  return httpOf(link.searchParams.get('url'))?.href ?? null;
};

/** A preview with a cached page is on screen: its link opens the reader. */
export const rememberInstantUrl = (url) => {
  const link = httpOf(url);
  if (!link) {
    return undefined;
  }
  const key = keyOf(link);
  known.set(key, (known.get(key) ?? 0) + 1);
  return () => {
    const left = (known.get(key) ?? 1) - 1;
    if (left > 0) {
      known.set(key, left);
    } else {
      known.delete(key);
    }
  };
};

/** The url to open for a clicked link, or null. */
export const instantTargetOf = (href) => {
  const wrapped = ivLinkTarget(href);
  if (wrapped) {
    return wrapped;
  }
  const link = httpOf(href);
  return link && known.has(keyOf(link)) ? link.href : null;
};

/** Asks the chat screen to open the reader on `url`; true when one took it. */
export const openInstantView = (url) => {
  const target = httpOf(url);
  if (!target || !globalThis.dispatchEvent) {
    return false;
  }
  const detail = { url: target.href, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

/** For a link click: true when the link opened in the reader. */
export const openInstantViewLink = (href) => {
  const target = instantTargetOf(href);
  return target ? openInstantView(target) : false;
};

/** Listens for the reader's requests; returns the unsubscribe. */
export const onInstantView = (handler) => {
  const listener = (event) => {
    event.detail.handled = true;
    handler(event.detail.url);
  };
  globalThis.addEventListener?.(EVENT, listener);
  return () => globalThis.removeEventListener?.(EVENT, listener);
};
