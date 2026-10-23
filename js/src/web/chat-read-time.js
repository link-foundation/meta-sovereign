// "Read at 14:05" in the menu of the user's own message in a private chat,
// as Telegram Desktop shows it (R-Y189; learned, never copied). It is
// asked only when the menu opens, and the answer kept per message.
// Telegram's refusals that mean "read" (the user or the person hides read
// times, the message is older than 7 days) show "Read" with no time, the
// privacy ones with "Hidden by privacy"; a message not read yet shows
// nothing.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { networkMessageId } from './chat-model.js';

const el = React.createElement;

/** Whether the menu may ask: one's own sent message, 1:1, not a bot. */
export const hasReadTime = (message, chat = {}, info = null) =>
  message?.source === 'telegram' &&
  message.sender === 'me' &&
  !message.pending &&
  !message.service &&
  chat.kind === 'private' &&
  chat.personal !== false &&
  info?.bot !== true &&
  networkMessageId(message) !== null;

const dayStart = (ms) => {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
};

/**
 * The line for an answer `{ read, date, code }` at time `now`, as
 * `{ key, params }` of a locale key, or null when nothing is to be shown:
 * today "Read at 14:05", yesterday "Read yesterday at 14:05", earlier
 * "Read on <date>", no time just "Read".
 */
export const readTimeLine = (answer, now, dates) => {
  if (!answer?.read) {
    return null;
  }
  const hidden =
    answer.code === 'your-privacy' || answer.code === 'peer-privacy';
  if (!Number.isFinite(answer.date)) {
    return {
      key: 'chat.readTime.plain',
      hidden,
    };
  }
  const days = Math.round((dayStart(now) - dayStart(answer.date)) / 86_400_000);
  let key = 'chat.readTime.on';
  if (days === 0) {
    key = 'chat.readTime.today';
  } else if (days === 1) {
    key = 'chat.readTime.yesterday';
  }
  return {
    key,
    params: {
      time: dates.time(answer.date),
      date: dates.dateTime(answer.date),
    },
    hidden: false,
  };
};

// message key → answer, for the page's life. A message not read yet or a
// failed ask is asked again at the next menu.
const answers = new Map();

/** Forgets the kept answers (tests). */
export const forgetReadTimes = () => answers.clear();

const keyOf = (message) => `${message.chat}:${networkMessageId(message)}`;

const useReadTime = (api, message) => {
  const key = keyOf(message);
  const [answer, setAnswer] = useState(answers.get(key) ?? null);
  useEffect(() => {
    if (answers.has(key) || typeof api?.telegramReadTime !== 'function') {
      return undefined;
    }
    let live = true;
    api
      .telegramReadTime({
        chat: String(message.chat),
        id: networkMessageId(message),
      })
      .then((got) => {
        if (got?.ok && got.read) {
          answers.set(key, got);
        }
        if (live && got?.ok) {
          setAnswer(got);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, key]);
  return answer;
};

/** The menu's read-time line; nothing while unknown or not read. */
export const ReadTimeLine = ({ api, message, now = Date.now() }) => {
  const t = useT();
  const dates = useDates();
  const line = readTimeLine(useReadTime(api, message), now, dates);
  if (!line) {
    return null;
  }
  return el(
    'li',
    {
      role: 'none',
      className: 'msg-context-info',
      'data-read-time': line.params ? 'time' : 'plain',
    },
    [
      t(line.key, line.params),
      line.hidden
        ? el(
            'span',
            { key: 'h', className: 'meta', 'data-read-hidden': true },
            ` · ${t('chat.readTime.hidden')}`
          )
        : null,
    ]
  );
};
