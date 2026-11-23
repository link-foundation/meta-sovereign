import React from 'react';
import { useT } from './i18n.js';
import { authorKey } from './message-visibility.js';
import {
  setSenderHidden,
  useHiddenSenders,
} from './message-visibility-prefs.js';

const el = React.createElement;

export const HiddenSenderSettings = () => {
  const t = useT();
  const senders = useHiddenSenders();
  return el(
    'section',
    { className: 'card', 'aria-labelledby': 'hidden-senders-title' },
    [
      el(
        'h3',
        { key: 'title', id: 'hidden-senders-title' },
        t('chat.visibility.settings')
      ),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t('chat.visibility.settingsHint')
      ),
      senders.length
        ? el(
            'ul',
            { key: 'list', className: 'hidden-senders' },
            senders.map((sender) => {
              const provider = t(`chat.about.network.${sender.source}`);
              return el('li', { key: authorKey(sender), className: 'row' }, [
                el('span', { key: 'name' }, [
                  sender.name,
                  el(
                    'span',
                    { key: 'identity', className: 'meta' },
                    ` · ${provider} · ${sender.id}`
                  ),
                ]),
                el(
                  'button',
                  {
                    key: 'restore',
                    type: 'button',
                    'data-action': 'restore-sender',
                    'aria-label': t('chat.visibility.restoreNamed', {
                      name: sender.name,
                    }),
                    onClick: () => setSenderHidden(sender, false),
                  },
                  t('chat.visibility.restore')
                ),
              ]);
            })
          )
        : el(
            'p',
            { key: 'empty', className: 'meta' },
            t('chat.visibility.none')
          ),
    ]
  );
};
