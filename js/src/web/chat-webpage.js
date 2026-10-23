// The link preview under a message (webPage), and, when Telegram has a
// cached page for it, Desktop's "INSTANT VIEW" button that opens the
// reader (R-Y205; learned, never copied).

import React, { useEffect } from 'react';
import { useT } from './i18n.js';
import {
  openInstantView,
  rememberInstantUrl,
} from './chat-instant-view-open.js';

const el = React.createElement;

const InstantViewButton = ({ url }) => {
  const t = useT();
  useEffect(() => rememberInstantUrl(url), [url]);
  return el(
    'button',
    {
      type: 'button',
      className: 'bubble-wp-iv',
      'data-action': 'instant-view',
      onClick: (event) => {
        event.stopPropagation();
        openInstantView(url);
      },
    },
    t('chat.iv.button')
  );
};

// What the page is: a story, a sticker set, a theme, a unique gift (R-Y221).
const PageKind = ({ badge }) =>
  el(
    'span',
    { className: 'bubble-wp-kind', 'data-wp-kind': badge },
    useT()(`chat.preview.${badge}`)
  );

export const WebPreview = ({ webPage }) => {
  if (!webPage) {
    return null;
  }
  const kind = webPage.kindOf;
  const title = webPage.title || kind?.name;
  return el('div', { className: 'bubble-webpage' }, [
    kind ? el(PageKind, { key: 'kind', badge: kind.badge }) : null,
    webPage.siteName
      ? el(
          'span',
          { key: 'site', className: 'bubble-wp-site' },
          webPage.siteName
        )
      : null,
    title
      ? el('strong', { key: 'title', className: 'bubble-wp-title' }, title)
      : null,
    webPage.description
      ? el(
          'span',
          { key: 'desc', className: 'bubble-wp-desc' },
          webPage.description
        )
      : null,
    webPage.instantView && webPage.url
      ? el(InstantViewButton, { key: 'iv', url: webPage.url })
      : null,
  ]);
};
