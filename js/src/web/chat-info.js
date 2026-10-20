// What the open chat's header says under its name, as Telegram's apps
// say it: a group's members and how many are online, a channel's
// subscribers, a person's "online" or when they were last seen, a bot's
// "bot". It is read from the server (`/api/telegram/chat-info`, which
// keeps it a minute), again every two minutes while the chat is open.

import { useEffect, useState } from 'react';

const EVERY_MS = 2 * 60_000;

/** The open chat's info, or null until (or unless) the server knows. */
export const useChatInfo = (api, current) => {
  const [info, setInfo] = useState(null);
  const chat = current?.source === 'telegram' ? current.chat : null;
  useEffect(() => {
    setInfo(null);
    if (!chat || typeof api?.telegramChatInfo !== 'function') {
      return undefined;
    }
    let active = true;
    const read = () =>
      api
        .telegramChatInfo(chat)
        .then((next) => active && next && !next.error && setInfo(next))
        .catch(() => {});
    read();
    const timer = globalThis.setInterval(read, EVERY_MS);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
    };
  }, [api, chat]);
  return info;
};

const LAST_SEEN = {
  recently: 'chat.info.lastSeenRecently',
  week: 'chat.info.lastSeenWeek',
  month: 'chat.info.lastSeenMonth',
};

/** The header's line for `info` in a chat of `kind`, or null. */
export const infoLine = (t, info, { kind, chatTime }) => {
  if (!info) {
    return null;
  }
  if (info.kind === 'user') {
    if (info.bot) {
      return t('chat.info.bot');
    }
    if (info.online) {
      return t('chat.info.onlineNow');
    }
    if (LAST_SEEN[info.lastSeen]) {
      return t(LAST_SEEN[info.lastSeen]);
    }
    return info.lastSeen
      ? t('chat.info.lastSeen', { when: chatTime(info.lastSeen) })
      : t('chat.info.lastSeenLong');
  }
  if (!Number.isInteger(info.members)) {
    return null;
  }
  if (kind === 'channel') {
    return t('chat.info.subscribers', { count: info.members });
  }
  const members = t('chat.info.members', { count: info.members });
  return info.online > 1
    ? `${members}, ${t('chat.info.online', { count: info.online })}`
    : members;
};
