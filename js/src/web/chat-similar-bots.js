// "Similar bots" in a bot's info column, as Telegram Desktop has them
// (R-Y194; learned, never copied): the bots Telegram recommends beside it
// (the list is as long as Telegram gives this account, shorter without
// Premium) as a row of avatars with names and monthly users. A click
// opens that bot's chat. Read only.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { ChatAvatar } from './chat-list.js';
import { appTarget } from './apps-model.js';

const el = React.createElement;

/** Whether the info column offers the row: a Telegram bot. */
export const hasSimilarBots = (chat, info, api) =>
  chat?.source === 'telegram' &&
  /^\d+$/.test(String(chat.chat)) &&
  info?.bot === true &&
  typeof api?.telegramBotSimilar === 'function';

const useBots = (api, chat, on) => {
  const [bots, setBots] = useState([]);
  useEffect(() => {
    setBots([]);
    if (!on) {
      return undefined;
    }
    let live = true;
    api
      .telegramBotSimilar({ chat })
      .then((answer) => live && answer?.ok && setBots(answer.bots ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, chat, on]);
  return bots;
};

const Card = ({ api, bot, t, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'similar-channel',
      'data-similar-bot': bot.chat,
      onClick: () => onPick(bot),
    },
    [
      el(ChatAvatar, {
        key: 'a',
        api,
        chat: { source: 'telegram', chat: bot.chat, name: bot.name },
      }),
      el('strong', { key: 'n', className: 'similar-channel-name' }, bot.name),
      bot.users
        ? el(
            'span',
            { key: 'm', className: 'meta' },
            t('chat.apps.users', { count: bot.users })
          )
        : null,
    ]
  );

/** The info column's row; `onOpenChat(target)` opens a bot's chat. */
export const SimilarBots = ({ api, chat, info, onOpenChat }) => {
  const t = useT();
  const on = hasSimilarBots(chat, info, api);
  const bots = useBots(api, String(chat?.chat), on);
  if (!on || bots.length === 0) {
    return null;
  }
  return el('section', { className: 'person-section similar-channels' }, [
    el('h4', { key: 'h', className: 'similar-title' }, t('chat.apps.similar')),
    el(
      'div',
      { key: 'r', className: 'similar-row' },
      bots.map((bot) =>
        el(Card, {
          key: bot.chat,
          api,
          bot,
          t,
          onPick: (b) => onOpenChat?.(appTarget(b)),
        })
      )
    ),
  ]);
};
