// A small yes/no question in a dialog for Settings (R-Y215): Escape and a
// click outside answer no, through the shared Escape stack so only the top
// dialog closes.

import React from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

export const ConfirmDialog = ({ name, title, text, yes, onYes, onNo }) => {
  const t = useT();
  useEsc(onNo);
  return createPortal(
    el(
      'div',
      {
        className: 'delete-dialog-overlay',
        onMouseDown: (e) => e.target === e.currentTarget && onNo(),
      },
      el(
        'div',
        {
          className: 'delete-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': title,
          'data-dialog': name,
        },
        [
          el('h3', { key: 'h' }, title),
          el('p', { key: 'p' }, text),
          el('div', { key: 'b', className: 'delete-dialog-btns' }, [
            el(
              'button',
              {
                key: 'y',
                type: 'button',
                className: 'danger',
                'data-action': `${name}-yes`,
                onClick: onYes,
              },
              yes
            ),
            el(
              'button',
              {
                key: 'n',
                type: 'button',
                'data-action': `${name}-no`,
                onClick: onNo,
              },
              t('common.cancel')
            ),
          ]),
        ]
      )
    ),
    document.body
  );
};
