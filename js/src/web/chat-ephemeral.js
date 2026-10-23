// Ephemeral messages in the chat (layer 232; R-Y223; learned, never
// copied): a bot's message shown to this user only (a group's welcome, a
// bot's private answer). The server keeps them as `eph:telegram:<chat>:<id>`
// links, shaped like a chat's messages, and streams them like any link;
// the page draws them inline among the chat's messages by date with the
// ordinary message bubble, marked "Only you can see this message", until
// Telegram deletes them. They never count as history: not unread, not
// read, not in the chat list.

import React, { useEffect, useMemo, useState } from 'react';
import { useT } from './i18n.js';
import { byTime } from './chat-model.js';
import { topicMessages } from './chat-topics.js';

const el = React.createElement;

const isEphemeral = (link) =>
  Boolean(link?.id?.startsWith('eph:')) && link.ephemeral === true;

/**
 * The chat's ephemeral messages: what the server listed (`fetched`) with
 * the `eph:` links streamed since (`links`, which win), without deleted
 * ones.
 */
export const ephemeralFor = (links, fetched, chat) => {
  const same = (l) => isEphemeral(l) && String(l.chat) === String(chat);
  const all = new Map();
  for (const link of [...(fetched ?? []), ...(links ?? [])]) {
    if (same(link)) {
      all.set(link.id, link);
    }
  }
  return [...all.values()].filter((l) => !l.deleted);
};

/** The chat's messages with its ephemeral ones among them, by date. */
export const placeEphemeral = (messages, ephemeral, topic = null) => {
  const shown = topicMessages(ephemeral, topic);
  return shown.length === 0 ? messages : [...messages, ...shown].sort(byTime);
};

/** The small mark under an ephemeral message's text. */
export const EphemeralMark = () => {
  const t = useT();
  return el(
    'span',
    { className: 'bubble-ephemeral', 'data-ephemeral': 'true' },
    t('chat.ephemeralMark')
  );
};

// What the server kept for the chat, asked when it opens.
const useFetched = (api, chat) => {
  const [fetched, setFetched] = useState({ chat: null, list: [] });
  useEffect(() => {
    if (!chat || typeof api?.telegramEphemeral !== 'function') {
      return undefined;
    }
    let live = true;
    api
      .telegramEphemeral({ chat })
      .then((answer) => {
        if (live && Array.isArray(answer?.messages)) {
          setFetched({ chat, list: answer.messages });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, chat]);
  return fetched.chat === chat ? fetched.list : [];
};

/**
 * `{ messages, links }` for the open chat: the shown messages with its
 * ephemeral ones placed by date, and the page's links with those added
 * (so a reply to one finds it).
 */
export const useEphemeral = (api, current, links, shown, topic) => {
  const chat = current?.source === 'telegram' ? current.chat : null;
  const fetched = useFetched(api, chat);
  const ephemeral = useMemo(
    () => (chat ? ephemeralFor(links, fetched, chat) : []),
    [links, fetched, chat]
  );
  const messages = useMemo(
    () => placeEphemeral(shown, ephemeral, topic),
    [shown, ephemeral, topic]
  );
  const known = useMemo(
    () => (ephemeral.length > 0 ? [...(links ?? []), ...ephemeral] : links),
    [links, ephemeral]
  );
  return { messages, links: known };
};
