// The QR code part of the Telegram sign-in (R-Y203): like Telegram Desktop's
// "Log in to Telegram by QR code". The code is drawn in the page as an SVG
// (../qr-code.js) from the `tg://login?token=…` URL the server holds; the
// server renews it when it expires and the page polls for the outcome.

import React, { useEffect, useRef } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { encodeQr, qrPath } from '../qr-code.js';

const el = React.createElement;

export const QR_POLL_MS = 1500;
const QUIET = 2;

/** The QR code of `text` as an inline SVG (dark modules on white). */
export const QrCode = ({ text }) => {
  const t = useT();
  const { modules, size } = React.useMemo(() => encodeQr(text), [text]);
  const full = size + QUIET * 2;
  return el(
    'svg',
    {
      className: 'tg-qr-code',
      role: 'img',
      'aria-label': t('telegramLogin.qrAlt'),
      'data-qr-version': size,
      viewBox: `0 0 ${full} ${full}`,
      shapeRendering: 'crispEdges',
    },
    [
      el('rect', { key: 'bg', width: full, height: full, fill: '#fff' }),
      el('path', {
        key: 'm',
        d: qrPath(modules, QUIET),
        fill: '#000',
      }),
    ]
  );
};

/** The code with Telegram Desktop's three steps beside it. */
export const QrPanel = ({ url }) => {
  const t = useT();
  return el('div', { className: 'tg-qr', 'data-tg-qr': 'true' }, [
    el('div', { key: 'c', className: 'tg-qr-box' }, el(QrCode, { text: url })),
    el('div', { key: 's', className: 'tg-qr-steps' }, [
      el('h4', { key: 'h' }, t('telegramLogin.qrTitle')),
      el('ol', { key: 'o' }, [
        el('li', { key: '1' }, t('telegramLogin.qrStep1')),
        el('li', { key: '2' }, t('telegramLogin.qrStep2')),
        el('li', { key: '3' }, t('telegramLogin.qrStep3')),
      ]),
      el('p', { key: 'w', className: 'meta' }, t('telegramLogin.qrWaiting')),
    ]),
  ]);
};

/**
 * While `id` is a QR sign-in being waited for, ask the server for its
 * state now and then and hand each answer to `onResult` (which decides
 * whether polling goes on, by changing `id`). Cancels a sign-in left
 * behind when the form goes away.
 */
export const useQrPolling = (id, onResult) => {
  const handler = useRef(onResult);
  handler.current = onResult;
  const live = useRef(null);
  live.current = id;
  useEffect(() => {
    if (!id) {
      return undefined;
    }
    let stopped = false;
    let timer = null;
    const tick = async () => {
      const result = await api.telegramLogin('qr-status', { id });
      if (stopped) {
        return;
      }
      handler.current(result);
      timer = globalThis.setTimeout(tick, QR_POLL_MS);
    };
    timer = globalThis.setTimeout(tick, QR_POLL_MS);
    return () => {
      stopped = true;
      globalThis.clearTimeout(timer);
    };
  }, [id]);
  useEffect(
    () => () => {
      if (live.current) {
        api.telegramLogin('qr-cancel', { id: live.current });
      }
    },
    []
  );
};
