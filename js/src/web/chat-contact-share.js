// "Share my contact" (R-Y217; learned, never copied): the link
// t.me/contact/<token> Telegram makes for the user
// (contacts.exportContactToken) with the time it stops working, a Copy
// button and the link as a QR code (drawn by ./qr-code.js). The link is
// asked for only once the dialog is opened by its button.

import React, { useEffect, useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { Frame } from './chat-readers.js';
import { qrSvg } from './qr-code.js';

const el = React.createElement;

/** The QR code of `text` as an image (an inline SVG). */
export const QrImage = ({ text, label }) => {
  let svg = '';
  try {
    svg = qrSvg(text, { ecc: 'M' });
  } catch {
    // too long to draw: the link itself is still shown
  }
  return svg
    ? el('span', {
        className: 'contact-qr',
        role: 'img',
        'aria-label': label,
        'data-qr': '',
        dangerouslySetInnerHTML: { __html: svg },
      })
    : null;
};

const useToken = (api) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramContactToken())
      .then(
        (a) =>
          live &&
          setState(
            a?.ok && a.url
              ? { phase: 'ready', url: a.url, expires: a.expires }
              : { phase: 'error' }
          )
      )
      .catch(() => live && setState({ phase: 'error' }));
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

const Ready = ({ state, t, locale }) => {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    Promise.resolve(globalThis.navigator?.clipboard?.writeText(state.url))
      .then(() => setCopied(true))
      .catch(() => {});
  const when = new Date(state.expires * 1000).toLocaleString(locale);
  return [
    el(QrImage, {
      key: 'q',
      text: state.url,
      label: t('chat.contactShare.qr'),
    }),
    el(
      'code',
      { key: 'u', className: 'contact-share-url', 'data-field': 'url' },
      state.url
    ),
    el(
      'p',
      { key: 'e', className: 'meta' },
      t('chat.contactShare.until', { when })
    ),
    el(
      'button',
      {
        key: 'c',
        type: 'button',
        'data-action': 'copy-contact-link',
        onClick: copy,
      },
      copied ? t('chat.contactShare.copied') : t('chat.contactShare.copy')
    ),
  ];
};

/** The dialog: the link, when it expires, Copy and the QR code. */
export const ShareContactDialog = ({ api, close }) => {
  const { t, locale } = useLocaleContext();
  const state = useToken(api);
  let body = el('p', { className: 'meta' }, t('chat.contactShare.loading'));
  if (state.phase === 'error') {
    body = el('p', { role: 'alert' }, t('chat.contactShare.failed'));
  } else if (state.phase === 'ready') {
    body = el(Ready, { state, t, locale });
  }
  return el(
    Frame,
    { title: t('chat.contactShare.title'), close, name: 'share-contact' },
    el('div', { className: 'contact-share' }, [
      el('p', { key: 'h', className: 'meta' }, t('chat.contactShare.hint')),
      body,
    ])
  );
};
