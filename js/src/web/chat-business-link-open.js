// A business chat link in a message opens in the app (R-Y180; learned,
// never copied): t.me/m/<slug> (or tg://message?slug=) resolves, the chat
// of its owner opens and the link's text goes into the message box. It is
// never sent by itself.

import { useEffect, useRef, useState } from 'react';

const HOSTS = /^(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)$/i;
const SLUG = /^[A-Za-z0-9_-]{1,64}$/;

/** The slug a business chat link carries (t.me/m/<slug>), or null. */
export const businessSlugOf = (href) => {
  let url;
  try {
    url = new URL(String(href ?? '').trim());
  } catch {
    return null;
  }
  if (url.username || url.password) {
    return null;
  }
  let slug = null;
  if (url.protocol === 'tg:' && url.hostname === 'message') {
    slug = url.searchParams.get('slug');
  } else if (
    ['http:', 'https:'].includes(url.protocol) &&
    HOSTS.test(url.hostname)
  ) {
    const [head, name, ...more] = url.pathname.split('/').filter(Boolean);
    slug = head === 'm' && more.length === 0 ? name : null;
  }
  return SLUG.test(slug ?? '') ? slug : null;
};

const EVENT = 'ms-business-link';

/** Asks the chat screen to open the link `href`; true when one took it. */
export const openBusinessLink = (href) => {
  const slug = businessSlugOf(href);
  if (!slug || !globalThis.dispatchEvent) {
    return false;
  }
  const detail = { slug, href, handled: false };
  globalThis.dispatchEvent(new CustomEvent(EVENT, { detail }));
  return detail.handled;
};

/**
 * Mounted once in the chat screen: a business chat link is resolved, its
 * chat opened, and its text put into the message box (not sent).
 */
export const useBusinessLinks = ({ state, api }) => {
  const latest = useRef({ state, api });
  latest.current = { state, api };
  const [waiting, setWaiting] = useState(null);
  useEffect(() => {
    const handler = (event) => {
      event.detail.handled = true;
      const { slug } = event.detail;
      const { state: now, api: client } = latest.current;
      Promise.resolve(client.telegramBusinessLinkResolve?.({ slug }))
        .then((answer) => {
          if (!answer?.ok) {
            // Not ours to open (gone, or no account): the browser has it.
            globalThis.open?.(
              event.detail.href,
              '_blank',
              'noopener,noreferrer'
            );
            return;
          }
          now.openAt?.({
            source: 'telegram',
            chat: answer.chat,
            name: answer.name ?? undefined,
            kind: 'user',
          });
          setWaiting({ chat: answer.chat, text: answer.text });
        })
        .catch(() => {});
    };
    globalThis.addEventListener?.(EVENT, handler);
    return () => globalThis.removeEventListener?.(EVENT, handler);
  }, []);
  const open = state.current?.chat;
  useEffect(() => {
    if (
      waiting &&
      open === waiting.chat &&
      state.current?.source === 'telegram'
    ) {
      state.composer?.setText?.(waiting.text, { typed: true });
      setWaiting(null);
    }
  }, [waiting, open]);
};
