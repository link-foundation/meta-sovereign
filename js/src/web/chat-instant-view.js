// The Instant View reader (R-Y205; learned, never copied): a full-height
// reader with the site's name, a back button and "Open in browser". The
// page's tree comes from the server (telegram-instant-view-shape.js) and
// is drawn with React elements only. Mounted once in the chat screen; a
// preview's button and an `t.me/iv?url=…` link ask it to open.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocaleContext } from './i18n.js';
import { Icon } from './icons.js';
import { Frame } from './chat-readers.js';
import { Spinner } from './spinner.js';
import { Blocks, linkOf } from './chat-instant-view-render.js';
import { onInstantView } from './chat-instant-view-open.js';

const el = React.createElement;

const ERRORS = [
  'not-found',
  'unreachable',
  'bad-url',
  'flood',
  'bad-request',
  'failed',
];

/** The text key for an error code of the server's answer. */
export const errorKey = (code) =>
  `chat.iv.err.${ERRORS.includes(code) ? code : 'failed'}`;

const useInstantPage = (api, url) => {
  const [state, setState] = useState({ phase: 'loading' });
  const [base, setBase] = useState(null);
  useEffect(() => {
    let live = true;
    setState({ phase: 'loading' });
    Promise.all([
      api.telegramInstantView({ url }),
      Promise.resolve(api.telegramInstantViewMediaBase?.()).catch(() => null),
    ])
      .then(([answer, where]) => {
        if (!live) {
          return;
        }
        setBase(where ?? null);
        if (answer?.ok && answer.available && answer.page) {
          setState({ phase: 'ready', answer });
        } else if (answer?.ok) {
          setState({ phase: 'unavailable' });
        } else {
          setState({ phase: 'error', code: answer?.code ?? 'failed' });
        }
      })
      .catch(() => live && setState({ phase: 'error', code: 'failed' }));
    return () => {
      live = false;
    };
  }, [api, url]);
  return { state, base };
};

const OpenInBrowser = ({ url, t }) => {
  const href = linkOf(url);
  return href
    ? el(
        'a',
        {
          className: 'iv-open-browser',
          'data-action': 'open-browser',
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        t('chat.iv.openBrowser')
      )
    : null;
};

const Notice = ({ text, url, t }) =>
  el('div', { className: 'iv-notice', 'data-state': 'notice' }, [
    el('p', { key: 'p' }, text),
    el(OpenInBrowser, { key: 'o', url, t }),
  ]);

const Article = ({ page, ctx }) =>
  el(
    'article',
    { className: 'iv-article-body', dir: page.rtl ? 'rtl' : 'ltr' },
    el(Blocks, { blocks: page.blocks, ctx })
  );

const Reader = ({ api, url, close }) => {
  const { t, locale } = useLocaleContext();
  const { state, base } = useInstantPage(api, url);
  const root = useRef(null);
  const ctx = useMemo(
    () => ({
      t,
      api,
      locale,
      media: (kind, id) =>
        base && /^\d{1,20}$/.test(String(id))
          ? `${base}?kind=${kind}&id=${id}`
          : null,
      // A video, audio or file of the page (R-Y224).
      file: (id, download) =>
        base && /^\d{1,20}$/.test(String(id))
          ? `${base}?kind=document&id=${id}&full=1${download ? '&download=1' : ''}`
          : null,
      scrollTo: (name) => {
        const found = [
          ...(root.current?.querySelectorAll('[data-anchor]') ?? []),
        ].find((node) => node.getAttribute('data-anchor') === name);
        found?.scrollIntoView?.({ block: 'start' });
      },
    }),
    [t, locale, base, api]
  );
  const answer = state.answer;
  const title = answer?.siteName || t('chat.iv.title');
  let body;
  if (state.phase === 'loading') {
    body = el('div', { className: 'iv-notice' }, [
      el(Spinner, { key: 's' }),
      el('p', { key: 'p' }, t('chat.iv.loading')),
    ]);
  } else if (state.phase === 'ready') {
    body = el(Article, { page: answer.page, ctx });
  } else if (state.phase === 'error') {
    body = el(Notice, { text: t(errorKey(state.code)), url, t });
  } else {
    body = el(Notice, { text: t('chat.iv.unavailable'), url, t });
  }
  return el(Frame, { title, close, name: 'instant-view' }, [
    el('div', { key: 'bar', className: 'iv-bar' }, [
      el(
        'button',
        {
          key: 'back',
          type: 'button',
          className: 'icon-btn',
          'data-action': 'back',
          'aria-label': t('chat.iv.back'),
          onClick: close,
        },
        el(Icon, { name: 'back' })
      ),
      el(OpenInBrowser, { key: 'open', url, t }),
    ]),
    el('div', { key: 'scroll', className: 'iv-scroll', ref: root }, body),
  ]);
};

/** Mounted once in the chat screen: the reader a request opens. */
export const InstantViewHost = ({ api }) => {
  const [url, setUrl] = useState(null);
  useEffect(() => onInstantView(setUrl), []);
  if (!url || typeof document === 'undefined') {
    return null;
  }
  const usable = typeof api?.telegramInstantView === 'function';
  return usable
    ? createPortal(
        el(Reader, { key: url, api, url, close: () => setUrl(null) }),
        document.body
      )
    : null;
};
