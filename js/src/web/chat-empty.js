// A conversation state occupies the usable pane, above the floating composer.
import React from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { OlderRow } from './chat-follow.js';
import { BusinessIntro } from './chat-business-profile.js';

const el = React.createElement;
export const EmptyConversation = ({ api, chat, history }) => {
  const t = useT();
  const pending = Boolean(
    history?.initialLoading ||
    history?.loading ||
    history?.failed ||
    history?.retryAt
  );
  const fallback = el('div', { className: 'chat-empty', role: 'status' }, [
    el(
      'span',
      { key: 'icon', className: 'chat-empty-icon', 'aria-hidden': 'true' },
      el(Icon, { name: 'chat', size: 24 })
    ),
    el('h3', { key: 'title', className: 'chat-empty-title' }, t('chat.empty')),
    el(
      'p',
      { key: 'hint', className: 'chat-empty-hint' },
      t(chat?.personal ? 'chat.emptyHint' : 'chat.emptyWaiting')
    ),
  ]);
  return el(
    'div',
    {
      className: 'chat-empty-region',
      'data-chat-state': pending ? 'loading' : 'empty',
    },
    pending
      ? el(OlderRow, { history })
      : el(BusinessIntro, { api, chat, fallback })
  );
};
