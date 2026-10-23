// "Channels you left", read only, as Telegram Desktop lists them when the
// channel limit is hit (R-Y200; learned, never copied): a button on the
// profile card opens the list, a page at a time ("Show more"); a row opens
// the channel's preview (the same as Similar channels), where Join is the
// only thing that joins. Telegram's refusals are told in words.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { Card, Preview, similarTarget } from './chat-similar.js';
import { openChat } from './chat-state.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.left.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.left.err.failed') : text;
};

/** The profile card's button, when the server can list them. */
export const LeftChannelsButton = ({ api, onClick }) => {
  const t = useT();
  return typeof api?.telegramLeftChannels === 'function'
    ? el(
        'button',
        { type: 'button', 'data-action': 'open-left-channels', onClick },
        t('chat.left.open')
      )
    : null;
};

// Pages of channels: the first at once, the rest by offset.
const useLeft = (api) => {
  const [state, setState] = useState({
    phase: 'loading',
    channels: [],
    next: null,
  });
  const load = (offset) =>
    api
      .telegramLeftChannels(offset ? { offset } : {})
      .catch(() => null)
      .then((answer) =>
        setState((old) =>
          answer?.ok
            ? {
                phase: 'ready',
                channels: [...(offset ? old.channels : []), ...answer.channels],
                next: answer.next ?? null,
              }
            : { phase: 'error', code: answer?.code ?? 'failed', channels: [] }
        )
      );
  useEffect(() => {
    load(0);
  }, [api]);
  return [state, load];
};

const Body = ({ api, state, load, pick, t }) => {
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.left.loading'));
  }
  if (state.phase === 'error') {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert', 'data-left-error': '' },
      errorText(t, state.code)
    );
  }
  if (state.channels.length === 0) {
    return el('p', { className: 'meta' }, t('chat.left.none'));
  }
  return el('div', null, [
    el('p', { key: 'h', className: 'meta' }, t('chat.left.hint')),
    el(
      'div',
      { key: 'l', className: 'similar-row left-channels' },
      state.channels.map((item) =>
        el(Card, { key: item.chat, api, item, t, onPick: pick })
      )
    ),
    state.next !== null
      ? el(
          'button',
          {
            key: 'm',
            type: 'button',
            className: 'comments-older',
            'data-action': 'left-more',
            onClick: () => load(state.next),
          },
          t('chat.left.more')
        )
      : null,
  ]);
};

/** The list over the profile card; a row opens the channel's preview. */
export const LeftChannelsDialog = ({ api, close }) => {
  const t = useT();
  const [state, load] = useLeft(api);
  const [preview, setPreview] = useState(null);
  return el(React.Fragment, null, [
    el(
      Frame,
      {
        key: 'f',
        title: t('chat.left.title'),
        close: preview ? () => {} : close,
        name: 'left-channels',
      },
      el(Body, { api, state, load, pick: setPreview, t })
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
            close();
            openChat(similarTarget(item));
          },
        })
      : null,
  ]);
};
