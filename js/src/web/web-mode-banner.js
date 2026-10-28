// Browser-only mode notice (issue #37). Shown above every view while
// no local server answers discovery: explains what still works, how
// to start a server (npm or GitHub npx), re-runs discovery on demand
// and, in a plain browser, links the desktop download page.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { DISMISS_STORAGE_KEY, webModeNotice } from './web-mode.js';
import { Busy } from './spinner.js';
import {
  useBrowserOnlyOffer,
  useConnectionHistory,
} from './connection-prefs.js';

const el = React.createElement;

const readDismissed = () => {
  try {
    return globalThis.sessionStorage?.getItem(DISMISS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const saveDismissed = () => {
  try {
    globalThis.sessionStorage?.setItem(DISMISS_STORAGE_KEY, '1');
  } catch {
    // Storage can be disabled; the notice then just hides for this render.
  }
};

// A server found only by its picture (Safari), once the app knows.
const useNearby = (online, findNearby) => {
  const [nearby, setNearby] = useState(null);
  useEffect(() => {
    if (online === false && findNearby) {
      findNearby()
        .then(setNearby)
        .catch(() => {});
    }
  }, [online, findNearby]);
  return nearby;
};

/**
 * @param {{ online: boolean|null, onRetry: () => Promise<boolean>,
 *           findNearby?: () => Promise<object|null>,
 *           notice?: object }} props `notice` overrides the computed
 *           webModeNotice() (tests render it without browser globals).
 */
// What the retry found, or the arc while it is still looking (R-Y84).
const RetryStatus = ({ retry, text }) => {
  if (!text) {
    return null;
  }
  return retry === 'checking'
    ? el(Busy, null, text)
    : el('p', { className: 'meta', role: 'status' }, text);
};

const hideOffer = (connectedBefore, offerBrowserOnly) =>
  connectedBefore && !offerBrowserOnly;

export const WebModeBanner = ({
  online,
  onRetry,
  findNearby,
  notice: given,
}) => {
  const t = useT();
  const connectedBefore = useConnectionHistory();
  const [offerBrowserOnly] = useBrowserOnlyOffer();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [retry, setRetry] = useState('idle');
  const nearby = useNearby(online, findNearby);
  const notice = given ?? webModeNotice({ online, nearby });
  if (!notice || dismissed || hideOffer(connectedBefore, offerBrowserOnly)) {
    return null;
  }
  const check = async () => {
    setRetry('checking');
    const found = await onRetry?.().catch(() => false);
    setRetry(found ? 'idle' : 'not-found');
  };
  const dismiss = () => {
    saveDismissed();
    setDismissed(true);
  };
  const status = {
    checking: t('webMode.checking'),
    'not-found': t('webMode.notFound'),
  }[retry];
  return el(
    'aside',
    {
      className: 'card local-server-help web-mode-banner',
      role: 'note',
      'data-runtime': notice.runtime,
      'aria-labelledby': 'web-mode-title',
    },
    [
      el('h2', { key: 'h', id: 'web-mode-title' }, t('webMode.title')),
      el('p', { key: 'body' }, t('webMode.body')),
      el(
        'p',
        { key: 'retrying', className: 'meta', role: 'status' },
        t('webMode.retrying')
      ),
      ...notice.commands.map((option) =>
        el('div', { key: option.id, className: 'col local-server-help-opt' }, [
          el('div', { key: 'h', className: 'meta' }, t(option.headingKey)),
          el('pre', { key: 'cmd' }, option.command),
        ])
      ),
      // A server seen by its picture gets its own, more exact, words.
      notice.safariHint && !notice.localFound && !notice.localOff
        ? el('p', { key: 'safari', className: 'meta' }, t('webMode.safari'))
        : null,
      notice.localFound
        ? el(
            'p',
            { key: 'local-found', className: 'meta', role: 'status' },
            t('webMode.localFound', { origin: notice.localFound })
          )
        : null,
      notice.trustHref
        ? el(
            'p',
            { key: 'trust', className: 'meta' },
            t('webMode.trust', {
              command: 'node js/bin/meta-sovereign.js trust',
            })
          )
        : null,
      notice.localOff
        ? el(
            'p',
            { key: 'local-off', className: 'meta', role: 'status' },
            t('webMode.localOff', { origin: notice.localOff })
          )
        : null,
      el('div', { key: 'actions', className: 'row' }, [
        el(
          'button',
          {
            key: 'retry',
            type: 'button',
            className: 'primary',
            'data-action': 'web-mode-retry',
            disabled: retry === 'checking',
            'aria-busy': retry === 'checking' ? 'true' : undefined,
            onClick: check,
          },
          t('webMode.retry')
        ),
        notice.localHref
          ? el(
              'a',
              {
                key: 'local',
                className: 'web-mode-local',
                href: notice.localHref,
              },
              t('webMode.openLocal')
            )
          : null,
        notice.trustHref
          ? el(
              'a',
              {
                key: 'trust',
                className: 'web-mode-trust',
                href: notice.trustHref,
              },
              t('webMode.trustLink')
            )
          : null,
        notice.downloadHref
          ? el(
              'a',
              {
                key: 'download',
                className: 'web-mode-download',
                href: notice.downloadHref,
              },
              t('webMode.download')
            )
          : null,
        el(
          'button',
          {
            key: 'dismiss',
            type: 'button',
            'data-action': 'web-mode-dismiss',
            onClick: dismiss,
          },
          t('webMode.dismiss')
        ),
      ]),
      el(RetryStatus, { key: 'status', retry, text: status }),
    ]
  );
};
