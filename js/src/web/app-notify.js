// Notifications of new messages in every section of the app (R-Y144):
// while the Chat section is open it watches the chats itself
// (./chat-state.js); in any other section this watcher, mounted by the
// app, follows the same chat list and gives the same notifications and
// the title's unread count. A click on one opens the Chat section at that
// chat.

import { useMemo, useState } from 'react';
import { useLiveLinks } from './chat-live.js';
import { summarizeChats } from './chat-model.js';
import { openChat } from './chat-state.js';
import { useNotifications } from './chat-notify.js';

const NO_CHATS = Object.freeze([]);

/** Renders nothing; `onOpen()` brings the Chat section forward. */
export const AppNotifications = ({ api, t, onOpen }) => {
  const [tick, setTick] = useState(0);
  const { links } = useLiveLinks(api, tick, () => setTick((n) => n + 1));
  const chats = useMemo(
    () => (links ? summarizeChats(links) : NO_CHATS),
    [links]
  );
  useNotifications({
    chats,
    current: null,
    api,
    show: (target) => {
      openChat(target);
      onOpen();
    },
    t,
  });
  return null;
};
