// "Similar channels" in a channel's info column, as Telegram Desktop has
// them (R-Y166; learned, never copied): the channels Telegram recommends
// beside it as a row of avatars with names and subscriber counts. A click
// opens one the app knows; any other shows its preview with Join. Nothing
// is joined until Join is pressed.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { ChatAvatar } from './chat-list.js';
import { chatKey } from './chat-model.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

/** Whether the info column offers the row: a Telegram channel. */
export const hasSimilar = (chat, info, api) =>
  chat?.source === 'telegram' &&
  String(chat.chat).startsWith('-100') &&
  info?.broadcast === true &&
  typeof api?.telegramSimilarChannels === 'function';

/** What opening a similar channel asks of the app. */
export const similarTarget = (item) => ({
  source: 'telegram',
  chat: item.chat,
  name: item.title,
  kind: 'channel',
});

const useSimilar = (api, chat, on) => {
  const [channels, setChannels] = useState([]);
  useEffect(() => {
    setChannels([]);
    if (!on) {
      return undefined;
    }
    let live = true;
    api
      .telegramSimilarChannels({ chat })
      .then((answer) => live && answer?.ok && setChannels(answer.channels))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, chat, on]);
  return channels;
};

const errorText = (t, code) => {
  const key = `chat.similar.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.similar.err.failed') : text;
};

const Preview = ({ api, item, onJoined, onClose }) => {
  const t = useT();
  const [state, setState] = useState({ busy: false, code: null });
  useEsc(onClose);
  const join = async () => {
    setState({ busy: true, code: null });
    const answer = await api
      .telegramSimilarJoin({ chat: item.chat })
      .catch(() => null);
    if (answer?.ok) {
      onJoined();
    } else {
      setState({ busy: false, code: answer?.code ?? 'failed' });
    }
  };
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': item.title,
      'data-dialog': 'similar-preview',
    },
    el('div', { className: 'delete-dialog invite-dialog' }, [
      el('div', { key: 'p', className: 'invite-preview' }, [
        el(ChatAvatar, {
          key: 'a',
          api,
          chat: { source: 'telegram', chat: item.chat, name: item.title },
        }),
        el('strong', { key: 't', className: 'invite-title' }, item.title),
        item.members
          ? el(
              'span',
              { key: 'm', className: 'meta invite-meta' },
              t('chat.info.subscribers', { count: item.members })
            )
          : null,
      ]),
      state.code
        ? el(
            'p',
            { key: 'e', className: 'invite-error', role: 'alert' },
            errorText(t, state.code)
          )
        : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'c',
            type: 'button',
            'data-action': 'cancel',
            onClick: onClose,
          },
          t('chat.invite.cancel')
        ),
        el(
          'button',
          {
            key: 'j',
            type: 'button',
            className: 'primary',
            'data-action': 'similar-join',
            disabled: state.busy,
            onClick: join,
          },
          t('chat.invite.join')
        ),
      ]),
    ])
  );
};

const Card = ({ api, item, t, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'similar-channel',
      'data-similar-channel': item.chat,
      onClick: () => onPick(item),
    },
    [
      el(ChatAvatar, {
        key: 'a',
        api,
        chat: { source: 'telegram', chat: item.chat, name: item.title },
      }),
      el('strong', { key: 'n', className: 'similar-channel-name' }, item.title),
      item.members
        ? el(
            'span',
            { key: 'm', className: 'meta' },
            t('chat.info.subscribers', { count: item.members })
          )
        : null,
    ]
  );

/** The info column's row; `onOpenChat(target)` opens a channel. */
export const SimilarChannels = ({ api, chat, info, hasChat, onOpenChat }) => {
  const t = useT();
  const on = hasSimilar(chat, info, api);
  const channels = useSimilar(api, String(chat?.chat), on);
  const [preview, setPreview] = useState(null);
  if (!on || channels.length === 0) {
    return null;
  }
  const pick = (item) =>
    hasChat?.(chatKey('telegram', item.chat))
      ? onOpenChat?.(similarTarget(item))
      : setPreview(item);
  return el('section', { className: 'person-section similar-channels' }, [
    el('h4', { key: 'h', className: 'similar-title' }, t('chat.similar.title')),
    el(
      'div',
      { key: 'r', className: 'similar-row' },
      channels.map((item) =>
        el(Card, { key: item.chat, api, item, t, onPick: pick })
      )
    ),
    preview
      ? el(Preview, {
          key: 'p',
          api,
          item: preview,
          onClose: () => setPreview(null),
          onJoined: () => {
            const item = preview;
            setPreview(null);
            onOpenChat?.(similarTarget(item));
          },
        })
      : null,
  ]);
};
