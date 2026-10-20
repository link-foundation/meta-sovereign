// The messages the open chat's replies quote, as Telegram's apps show
// them: the original's author and text above each reply, even when the
// original is far older than what is on screen. Each is looked for in
// what the page holds, then in the server's store, then — for Telegram —
// read from Telegram by its id (the `view` priority: it is on screen),
// once per message.

import { useEffect, useMemo, useRef, useState } from 'react';
import { replyLinkId } from './message-parts.js';

const MAX_READ = 100; // one `refresh` asks Telegram for at most this many

const idParts = (id) => {
  const [, source, ...rest] = String(id).split(':');
  return { source, chat: rest.slice(0, -1).join(':'), msg: rest.at(-1) };
};

/** The ids `messages` reply to that `known` does not hold. */
export const missingReplies = (messages, known) => [
  ...new Set(
    messages
      .map(replyLinkId)
      .filter((id) => id && !known.has(id) && !id.startsWith('msg:pending'))
  ),
];

// Telegram's ids of one chat, by chat, for `telegramRefresh`.
const telegramAsks = (ids) => {
  const byChat = new Map();
  for (const id of ids) {
    const { source, chat, msg } = idParts(id);
    const n = Number(msg);
    if (source === 'telegram' && chat && Number.isInteger(n) && n > 0) {
      byChat.set(chat, [...(byChat.get(chat) ?? []), n].slice(0, MAX_READ));
    }
  }
  return byChat;
};

const fetchStored = async (api, ids) => {
  if (typeof api.storedLink !== 'function') {
    return [];
  }
  const got = await Promise.all(
    ids.map((id) => api.storedLink(id).catch(() => null))
  );
  return got.filter((l) => l?.id);
};

const readFromTelegram = async (api, ids) => {
  if (typeof api.telegramRefresh !== 'function') {
    return [];
  }
  const found = [];
  for (const [chat, msgIds] of telegramAsks(ids)) {
    const answer = await api
      .telegramRefresh({ chat, ids: msgIds, priority: 'view' })
      .catch(() => null);
    if (answer && !answer.error) {
      found.push(
        ...(await fetchStored(
          api,
          msgIds.map((n) => `msg:telegram:${chat}:${n}`)
        ))
      );
    }
  }
  return found;
};

/**
 * A map of link id → link holding the originals the chat's replies
 * quote, and the messages of `extra` ids (the pinned one): `links` and
 * the window's messages, plus what was fetched.
 */
export const useReplyTargets = (api, messages, links, window, extra = []) => {
  const [fetched, setFetched] = useState(() => new Map());
  const asked = useRef(new Set());
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  const known = useMemo(() => {
    const map = new Map();
    for (const l of [...(links ?? []), ...(window?.messages ?? [])]) {
      if (l?.id?.startsWith('msg:')) {
        map.set(l.id, l);
      }
    }
    for (const [id, l] of fetched) {
      if (!map.has(id)) {
        map.set(id, l);
      }
    }
    return map;
  }, [links, window, fetched]);
  const wanted = extra.filter(Boolean).join('\n');
  const missing = useMemo(
    () =>
      [
        ...new Set([
          ...missingReplies(messages, known),
          ...extra.filter((id) => id && !known.has(id)),
        ]),
      ].filter((id) => !asked.current.has(id)),
    [messages, known, wanted]
  );
  useEffect(() => {
    if (missing.length === 0) {
      return undefined;
    }
    for (const id of missing) {
      asked.current.add(id);
    }
    (async () => {
      const stored = await fetchStored(api, missing);
      const have = new Set(stored.map((l) => l.id));
      const read = await readFromTelegram(
        api,
        missing.filter((id) => !have.has(id))
      );
      const got = [...stored, ...read];
      if (mounted.current && got.length > 0) {
        setFetched((before) => {
          const next = new Map(before);
          for (const l of got) {
            next.set(l.id, l);
          }
          return next;
        });
      }
    })();
    return undefined;
  }, [api, missing.join('\n')]);
  return known;
};
