// "Telegram Business" in the user's own profile card, as Telegram
// Desktop's Settings → Telegram Business lists its sections (R-Y179;
// learned, never copied). Each part of Telegram Business adds one entry to
// SECTIONS: `{ id, label (a locale key), needs (the api method it uses),
// Component ({ api, close }) }`; the menu shows those the page can use and
// opens one in place of the list (Escape or its close goes back here).

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { QuickRepliesDialog } from './quick-replies.js';
import { BusinessMessageDialog } from './business-messages.js';

const el = React.createElement;

const message = (kind) => (props) =>
  el(BusinessMessageDialog, { ...props, kind });

/** The sections of Telegram Business, in Desktop's order. */
export const SECTIONS = [
  {
    id: 'quick-replies',
    label: 'business.section.quickReplies',
    needs: 'telegramQuickReplies',
    Component: QuickRepliesDialog,
  },
  {
    id: 'greeting',
    label: 'business.section.greeting',
    needs: 'telegramBusinessMessages',
    Component: message('greeting'),
  },
  {
    id: 'away',
    label: 'business.section.away',
    needs: 'telegramBusinessMessages',
    Component: message('away'),
  },
];

/** The sections `api` can serve. */
export const sectionsFor = (api, sections = SECTIONS) =>
  sections.filter((s) => typeof api?.[s.needs] === 'function');

/** The Telegram Business list, in a dialog. */
export const BusinessDialog = ({ api, close }) => {
  const t = useT();
  const [open, setOpen] = useState(null);
  const sections = sectionsFor(api);
  const section = sections.find((s) => s.id === open);
  if (section) {
    return el(section.Component, { api, close: () => setOpen(null) });
  }
  return el(Frame, { title: t('business.title'), close, name: 'business' }, [
    el('p', { key: 'i', className: 'meta' }, t('business.intro')),
    el(
      'ul',
      { key: 'l', className: 'member-list business-sections' },
      sections.map((s) =>
        el(
          'li',
          { key: s.id },
          el(
            'button',
            {
              type: 'button',
              className: 'business-section',
              'data-section': s.id,
              onClick: () => setOpen(s.id),
            },
            t(s.label)
          )
        )
      )
    ),
  ]);
};

/** "Telegram Business" in the profile card, or nothing without sections. */
export const BusinessButton = ({ api, onClick }) => {
  const t = useT();
  return sectionsFor(api).length > 0
    ? el(
        'button',
        {
          type: 'button',
          'data-action': 'open-business',
          onClick,
        },
        t('business.title')
      )
    : null;
};
