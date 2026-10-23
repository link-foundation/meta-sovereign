// HTML5 bot games (R-Y190), as Telegram Desktop shows them (learned,
// never copied): a game message is a card — the game's picture, its title
// and description — with the bot's "Play" button under it; a game that
// came without the button (a forwarded one) has "Play" in the card. Play
// asks the bot (messages.getBotCallbackAnswer with `game`) for the
// game's address, which is opened in a new tab after asking, as a bot's
// link is. "High scores" in the message's menu lists who plays best.
// Posting a score is the bot's, never the app's.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { networkMessageId } from './chat-model.js';
import { inlineKeyboardOf } from './bot-keyboard.js';
import { MediaPhoto } from './chat-photo.js';
import { PeerAvatar } from './peer-avatar.js';
import { Frame } from './chat-readers.js';

const el = React.createElement;

const WEB = /^https?:\/\//i;

/** A game's address as it may be opened: a web link only; null else. */
export const gameUrl = (url) => {
  const value = String(url ?? '').trim();
  return WEB.test(value) ? value : null;
};

/** Whether `message` is a game: it carries a game as its media. */
export const isGameMessage = (message) =>
  message?.raw?.media?.className === 'MessageMediaGame';

/** Whether the menu offers "High scores": a sent game of Telegram. */
export const hasGameScores = (message) =>
  message?.source === 'telegram' &&
  isGameMessage(message) &&
  !message.pending &&
  networkMessageId(message) !== null;

/** Whether the bot's own "Play" button is under `message`. */
export const hasPlayButton = (message) =>
  (inlineKeyboardOf(message) ?? []).some((row) =>
    row.some((button) => button.kind === 'game')
  );

/** The press the card's own "Play" makes, as the bot's button would. */
export const playButton = (text) => ({ kind: 'game', text });

/** The card: picture, title, description, and "Play" when the bot gave none. */
export const GameCard = ({ media, api, chat, msgId, message, onAction }) => {
  const t = useT();
  const own =
    typeof onAction === 'function' &&
    message &&
    !message.pending &&
    !hasPlayButton(message);
  return el('div', { className: 'bubble-card game', 'data-game': '' }, [
    media.photo
      ? el(
          'div',
          { key: 'p', className: 'game-photo' },
          el(MediaPhoto, { media: media.photo, api, chat, msgId })
        )
      : null,
    el('span', { key: 'l', className: 'card-lines' }, [
      el('strong', { key: 't', className: 'game-title' }, media.title ?? ''),
      media.description
        ? el(
            'span',
            { key: 'd', className: 'meta game-description' },
            media.description
          )
        : null,
      own
        ? el(
            'button',
            {
              key: 'play',
              type: 'button',
              className: 'card-action',
              'data-action': 'game-play',
              onClick: (event) => {
                event.stopPropagation();
                onAction('bot', message, playButton(t('chat.game.play')));
              },
            },
            t('chat.game.play')
          )
        : null,
    ]),
  ]);
};

const errorText = (t, code) => {
  const key = `chat.game.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.game.err.failed') : text;
};

const ScoreRow = ({ one, api }) =>
  el(
    'li',
    {
      className: one.me
        ? 'reader-row game-score is-me'
        : 'reader-row game-score',
      'data-score': one.pos,
    },
    [
      el('span', { key: 'pos', className: 'game-pos' }, `${one.pos}`),
      el(PeerAvatar, {
        key: 'av',
        api,
        source: 'telegram',
        peer: one.user,
        name: one.name,
        className: 'msg-avatar',
      }),
      el('span', { key: 'n', className: 'member-name' }, one.name),
      el('strong', { key: 's', className: 'game-points' }, `${one.score}`),
    ]
  );

const ScoresBody = ({ phase, scores, code, api }) => {
  const t = useT();
  if (phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.game.loading'));
  }
  if (phase === 'error') {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      errorText(t, code)
    );
  }
  return scores.length === 0
    ? el('p', { className: 'meta' }, t('chat.game.empty'))
    : el(
        'ul',
        { className: 'member-list' },
        scores.map((one) =>
          el(ScoreRow, { key: `${one.pos}:${one.user}`, one, api })
        )
      );
};

const ScoresPanel = ({ message, api, close }) => {
  const t = useT();
  const [state, setState] = useState({ phase: 'loading', scores: [] });
  useEffect(() => {
    let live = true;
    Promise.resolve(
      api.telegramGameScores({
        chat: String(message.chat),
        id: networkMessageId(message),
      })
    )
      .catch(() => null)
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { phase: 'ready', scores: answer.scores ?? [] }
              : { phase: 'error', code: answer?.code, scores: [] }
          );
        }
      });
    return () => {
      live = false;
    };
  }, [message.id]);
  const title = message.raw?.media?.game?.title;
  return el(
    Frame,
    {
      title: title
        ? t('chat.game.scoresOf', { game: title })
        : t('chat.game.scores'),
      close,
      name: 'game-scores',
    },
    el(ScoresBody, { ...state, api })
  );
};

/** The high scores panel: `{ open(message), dialog }`; dialog null if closed. */
export const useGameScores = ({ api }) => {
  const [shown, setShown] = useState(null);
  const close = useCallback(() => setShown(null), []);
  return {
    open: (message) => setShown(message),
    dialog: shown
      ? el(ScoresPanel, { key: 'game-scores', message: shown, api, close })
      : null,
  };
};
