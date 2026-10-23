// "Share message" for a mini app's prepared message (R-Y194; learned from
// Telegram's public Mini Apps documentation, never copied): the app asks
// (web_app_send_prepared_message, with an id its bot saved); Telegram is
// asked for that message; a chooser shows it — title, text, the kinds of
// chat it may go to — over the app, and the chats of those kinds. Only a
// click on a chat sends it, through the inline-result send. The app is
// told `prepared_message_sent`, or `prepared_message_failed` with a reason
// when nothing was sent (declined, expired, failed).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { ChatAvatar } from './chat-list.js';
import { Spinner } from './spinner.js';
import { failureWord, shareChats } from './apps-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.apps.share.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.apps.share.err.failed') : text;
};

// The prepared message, asked for once.
const useMessage = (api, bot, id) => {
  const [state, setState] = useState({ message: null, code: null });
  useEffect(() => {
    let live = true;
    Promise.resolve(api?.telegramPreparedMessage?.({ bot, id }))
      .then((answer) => {
        if (live) {
          setState(
            answer?.ok
              ? { message: answer, code: null }
              : { message: null, code: answer?.code ?? 'failed' }
          );
        }
      })
      .catch(() => live && setState({ message: null, code: 'failed' }));
    return () => {
      live = false;
    };
  }, [api, bot, id]);
  return state;
};

const Preview = ({ message, t }) =>
  el('div', { className: 'prepared-preview', 'data-prepared-preview': '' }, [
    message.preview.title
      ? el('strong', { key: 't' }, message.preview.title)
      : null,
    message.preview.description
      ? el('p', { key: 'd', className: 'meta' }, message.preview.description)
      : null,
    el(
      'span',
      { key: 'k', className: 'meta' },
      t('chat.apps.share.types', {
        types: message.peerTypes
          .map((type) => t(`chat.apps.share.type.${type}`))
          .join(', '),
      })
    ),
  ]);

const ChatPick = ({ api, chat, busy, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'chat-item prepared-chat',
      'data-share-chat': chat.key,
      disabled: busy,
      onClick: () => onPick(chat),
    },
    [
      el(ChatAvatar, { key: 'a', api, chat }),
      el('span', { key: 'n', className: 'chat-item-title' }, chat.name),
    ]
  );

/**
 * The chooser: `bot` the app's bot, `id` the prepared message's, `chats`
 * the chat list; `done(sent, word?)` tells the app how it ended.
 */
export const PreparedShare = ({ api, bot, id, chats = [], done }) => {
  const t = useT();
  const { message, code } = useMessage(api, bot, id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    if (code) {
      done(false, failureWord(code));
    }
  }, [code]);
  const pick = async (chat) => {
    setBusy(true);
    setError(null);
    const answer = await Promise.resolve(
      api?.telegramInlineSend?.({
        chat: String(chat.chat),
        queryId: message.queryId,
        id: message.id,
      })
    ).catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done(true);
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const q = filter.trim().toLocaleLowerCase();
  const list = message
    ? shareChats(chats, message.peerTypes, bot).filter(
        (c) => !q || String(c.name).toLocaleLowerCase().includes(q)
      )
    : [];
  return createPortal(
    el(
      Frame,
      {
        title: t('chat.apps.share.title'),
        close: () => done(false, 'USER_DECLINED'),
        name: 'prepared-share',
      },
      message
        ? [
            el(Preview, { key: 'p', message, t }),
            el('input', {
              key: 'f',
              type: 'search',
              className: 'prepared-filter',
              placeholder: t('chat.apps.share.search'),
              'aria-label': t('chat.apps.share.search'),
              value: filter,
              onChange: (event) => setFilter(event.target.value),
            }),
            error
              ? el(
                  'p',
                  {
                    key: 'e',
                    className: 'comments-failed',
                    role: 'alert',
                    'data-prepared-error': error,
                  },
                  errorText(t, error)
                )
              : null,
            list.length === 0
              ? el('p', { key: 'n', className: 'meta' }, t('chat.noMatches'))
              : el(
                  'div',
                  { key: 'l', className: 'prepared-chats' },
                  list.map((chat) =>
                    el(ChatPick, {
                      key: chat.key,
                      api,
                      chat,
                      busy,
                      onPick: pick,
                    })
                  )
                ),
          ]
        : el('p', { className: 'meta' }, el(Spinner))
    ),
    globalThis.document.body
  );
};

/**
 * The panel's hook: `{ ask(id), dialog }`. `post` tells the app; `bot` is
 * its bot's id. One chooser at a time.
 */
export const usePreparedShare = ({ api, bot, chats, post }) => {
  const [open, setOpen] = useState(null);
  const done = (sent, word) => {
    setOpen(null);
    if (sent) {
      post('prepared_message_sent', {});
    } else {
      post('prepared_message_failed', { error: word ?? 'UNKNOWN_ERROR' });
    }
  };
  return {
    open: Boolean(open),
    ask: (id) => {
      if (open || !/^\d{1,20}$/.test(String(bot ?? ''))) {
        post('prepared_message_failed', { error: 'UNKNOWN_ERROR' });
        return;
      }
      setOpen({ id });
    },
    dialog: open
      ? el(PreparedShare, {
          key: `prepared-${open.id}`,
          api,
          bot: String(bot),
          id: open.id,
          chats,
          done,
        })
      : null,
  };
};
