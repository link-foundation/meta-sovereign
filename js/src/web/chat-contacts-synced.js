// Synced contacts in Privacy and Security (R-Y217; learned, never
// copied): how many contacts imported from a phone Telegram keeps for the
// account (contacts.getSaved), and "Delete synced contacts"
// (contacts.resetSaved) behind a confirmation. The contacts the user added
// by hand stay.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { ConfirmedClear } from './chat-drafts-clear.js';

const el = React.createElement;

// The count of saved contacts, asked once (read only); null until known.
const useSavedCount = (api) => {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramSavedContacts?.())
      .then((a) => live && a?.ok && setCount(Number(a.count) || 0))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  return [count, setCount];
};

/** The count and the deletion, or nothing without the page's calls. */
export const SyncedContacts = ({ api }) => {
  const t = useT();
  const [count, setCount] = useSavedCount(api);
  if (typeof api?.telegramSavedContactsReset !== 'function') {
    return null;
  }
  return el(
    ConfirmedClear,
    {
      name: 'synced',
      words: {
        hint: t('chat.synced.hint'),
        button: t('chat.synced.delete'),
        text: t('chat.synced.confirm'),
        cancel: t('chat.synced.cancel'),
        yes: t('chat.synced.confirmYes'),
        done: t('chat.synced.done'),
        failed: t('chat.synced.failed'),
      },
      run: async () => {
        const answer = await api.telegramSavedContactsReset();
        if (answer?.ok) {
          setCount(0);
        }
        return answer;
      },
    },
    count === null
      ? null
      : el(
          'p',
          { key: 'c', 'data-synced-count': count },
          t('chat.synced.count', { count })
        )
  );
};
