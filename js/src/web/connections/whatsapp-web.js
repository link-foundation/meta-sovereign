// WhatsApp Web (personal account) on the WhatsApp card (R-Z9).
//
//   - the terms notice, always shown: WhatsApp does not allow automated or
//     bulk use of Web, so the app only sends what the person confirms;
//   - "Sign in to WhatsApp Web": opens a visible window for the person to
//     scan the QR code themselves, and reports whether the chat list was
//     seen (signed in).

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../dom.js';
import { useT } from '../i18n.js';
import { errorText } from '../api-errors.js';

const el = React.createElement;
const POLL_MS = 2000;

const stateText = (t, status, busy) => {
  if (busy) {
    return t('whatsapp.web.opening');
  }
  if (status?.open) {
    return t('whatsapp.web.waiting');
  }
  if (status?.signedIn) {
    return t('whatsapp.web.signedIn', {
      when: String(status.signedInAt ?? '').slice(0, 10),
    });
  }
  return t('whatsapp.web.closed');
};

export const WhatsAppWebPanel = () => {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const next = await api.whatsappWeb('status');
    if (next && !next.error) {
      setStatus(next);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // While the window is open, watch for the sign-in being seen.
  useEffect(() => {
    if (!status?.open) {
      return undefined;
    }
    const timer = globalThis.setInterval(refresh, POLL_MS);
    return () => globalThis.clearInterval(timer);
  }, [status?.open, refresh]);

  const act = async (action) => {
    setBusy(action === 'sign-in');
    setError('');
    try {
      const next = await api.whatsappWeb(action);
      if (next?.error) {
        setError(
          t('whatsapp.web.failed', {
            error: errorText(t, next.code, next.error),
          })
        );
      } else {
        setStatus(next);
      }
    } finally {
      setBusy(false);
    }
  };

  return el(
    'div',
    {
      className: 'col whatsapp-web',
      'data-whatsapp-state': status?.open
        ? 'waiting'
        : status?.signedIn
          ? 'signed-in'
          : 'closed',
    },
    [
      el('h4', { key: 'h', className: 'meta' }, t('whatsapp.web.title')),
      el(
        'p',
        { key: 'terms', className: 'meta', 'data-whatsapp-terms': 'true' },
        t('whatsapp.web.terms')
      ),
      el(
        'p',
        { key: 'state', className: 'meta', role: 'status' },
        stateText(t, status, busy)
      ),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'sign-in',
            type: 'button',
            className: 'primary',
            'data-action': 'whatsapp-web-sign-in',
            disabled: busy || Boolean(status?.open),
            onClick: () => act('sign-in'),
          },
          t('whatsapp.web.signIn')
        ),
        status?.open
          ? el(
              'button',
              {
                key: 'close',
                type: 'button',
                'data-action': 'whatsapp-web-close',
                onClick: () => act('close'),
              },
              t('whatsapp.web.close')
            )
          : null,
      ]),
      error ? el('p', { key: 'error', role: 'alert' }, error) : null,
    ]
  );
};
