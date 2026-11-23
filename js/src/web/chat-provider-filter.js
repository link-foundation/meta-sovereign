import React, { useMemo, useState } from 'react';
import { networkName } from './connection-guides.js';
import { useT } from './i18n.js';

export const filterChatProvider = (chats, provider) =>
  provider === 'all' ? chats : chats.filter((chat) => chat.source === provider);

export const useChatProvider = (chats) => {
  const [saved, choose] = useState('all');
  const providers = useMemo(
    () =>
      [...new Set(chats.map(({ source }) => source).filter(Boolean))].sort(),
    [chats]
  );
  return {
    selected: providers.includes(saved) ? saved : 'all',
    providers,
    choose,
  };
};

const el = React.createElement;

export const ChatProviderFilter = ({ filter }) => {
  const t = useT();
  if (!filter || filter.providers.length < 2) {
    return null;
  }
  return el(
    'select',
    {
      className: 'chat-sort',
      'data-chat-provider': '',
      'aria-label': t('chat.provider.label'),
      value: filter.selected,
      onChange: (event) => filter.choose(event.target.value),
    },
    [
      el('option', { key: 'all', value: 'all' }, t('chat.provider.all')),
      ...filter.providers.map((provider) =>
        el(
          'option',
          { key: provider, value: provider },
          networkName(t, provider)
        )
      ),
    ]
  );
};
