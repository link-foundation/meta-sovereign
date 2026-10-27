import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';

const el = React.createElement;
export const WEB_APP_LOAD_TIMEOUT_MS = 15_000;

// An iframe load event also fires for blocked/error pages. Only the validated
// SDK ready event confirms success; missing readiness always has a deadline.
export const useWebAppProgress = (ready) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (ready) {
      setFailed(false);
      return undefined;
    }
    const timer = globalThis.setTimeout(
      () => setFailed(true),
      WEB_APP_LOAD_TIMEOUT_MS
    );
    return () => globalThis.clearTimeout(timer);
  }, [ready]);
  return { failed, onError: () => setFailed(true) };
};

export const WebAppLoading = ({ ready, failed, error, url, onRetry }) => {
  const t = useT();
  if (ready) {
    return null;
  }
  if (!failed && !error) {
    return el('div', { className: 'web-app-loading', role: 'status' }, [
      el('span', {
        key: 's',
        className: 'web-app-spinner',
        'aria-hidden': 'true',
      }),
      el('span', { key: 't', className: 'sr-only' }, t('chat.webApp.loading')),
    ]);
  }
  return el(
    'div',
    {
      className: 'web-app-loading is-failed',
      role: 'alert',
      'data-web-app-failed': true,
    },
    [
      el(
        'p',
        { key: 'message' },
        t(error ? 'chat.webApp.openFailed' : 'chat.webApp.notResponding')
      ),
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'retry',
            type: 'button',
            'data-action': 'web-app-retry',
            onClick: onRetry,
          },
          t('chat.webApp.retry')
        ),
        url
          ? el(
              'a',
              {
                key: 'browser',
                className: 'button',
                href: url,
                target: '_blank',
                rel: 'noopener noreferrer',
                'data-action': 'web-app-browser',
              },
              t('chat.webApp.browser')
            )
          : null,
      ]),
    ]
  );
};
