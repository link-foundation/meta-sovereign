// The pinned message bar and its list, as Telegram Desktop has them
// (R-Y166; learned, never copied): the bar over the messages shows the
// newest pinned message and, with more than one pinned, a list button that
// opens "N pinned messages" — each one clickable to go to it, with
// "Unpin" for those who may pin and "Unpin all messages" at the bottom
// (asked in the page; in a forum topic it is the topic's pins). Those who
// may not unpin get "Hide pinned messages" instead: the bar goes, kept per
// chat in this browser, until a new message is pinned.

import React, { useCallback, useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { useEsc } from './chat-invite.js';
import { Icon } from './icons.js';
import { mediaLabel } from './chat-message.js';
import { parseMessageParts } from './message-parts.js';
import { networkMessageId } from './chat-model.js';

const el = React.createElement;

const STORE = 'ms.pinnedHidden:';

/** The browser's key for what is hidden in a chat (and topic). */
export const hiddenKey = (chatKey, topic = null) =>
  `${STORE}${chatKey}${topic ? `#${topic}` : ''}`;

/** The pinned id hidden under `key`, or null. */
export const readHidden = (key, storage = globalThis.localStorage) => {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

/** Remembers `id` as the hidden pinned message under `key`. */
export const writeHidden = (key, id, storage = globalThis.localStorage) => {
  try {
    storage?.setItem(key, String(id));
  } catch {
    // Without storage the bar is hidden until the page is left.
  }
};

/** Whether the user may unpin here: always in a person's chat. */
export const mayUnpin = (chat, info) =>
  Boolean(chat?.personal) || info?.canPin === true;

/** The list after a page: new messages added, one already there kept once. */
export const mergePinned = (list, page) => {
  const seen = new Set(list.map((m) => m.id));
  return [...list, ...page.filter((m) => !seen.has(m.id))];
};

const useHidden = (chat, topic, pinnedId) => {
  const key = chat ? hiddenKey(chat.key, topic) : null;
  const [stored, setStored] = useState(() => (key ? readHidden(key) : null));
  useEffect(() => {
    setStored(key ? readHidden(key) : null);
  }, [key]);
  const hide = useCallback(() => {
    if (key && pinnedId) {
      writeHidden(key, pinnedId);
      setStored(String(pinnedId));
    }
  }, [key, pinnedId]);
  return [Boolean(pinnedId) && stored === String(pinnedId), hide];
};

const usePinnedList = (api, chat, topic, token) => {
  const [state, setState] = useState({
    messages: [],
    count: 0,
    next: null,
    busy: false,
    failed: false,
  });
  const wanted =
    chat?.source === 'telegram' &&
    token &&
    typeof api?.telegramPinnedList === 'function';
  const load = useCallback(
    (offsetId) => {
      setState((s) => ({ ...s, busy: true, failed: false }));
      return api
        .telegramPinnedList({
          chat: String(chat.chat),
          ...(topic ? { topMsgId: topic } : {}),
          ...(offsetId ? { offsetId } : {}),
        })
        .catch(() => null)
        .then((answer) =>
          setState((s) =>
            answer?.ok
              ? {
                  messages: mergePinned(
                    offsetId ? s.messages : [],
                    answer.messages ?? []
                  ),
                  count: Number(answer.count) || 0,
                  next: answer.next ?? null,
                  busy: false,
                  failed: false,
                }
              : { ...s, busy: false, failed: true }
          )
        );
    },
    [api, chat?.chat, topic]
  );
  useEffect(() => {
    if (wanted) {
      load(null);
    }
  }, [wanted, load, token]);
  return {
    ...state,
    more: () => load(state.next),
    removed: (id) =>
      setState((s) => ({
        ...s,
        messages: s.messages.filter((m) => m.id !== id),
        count: Math.max(0, s.count - 1),
      })),
  };
};

const Item = ({ message, mayUnpinIt, onGo, onUnpin }) => {
  const t = useT();
  const { dateTime } = useDates();
  const { text, media } = parseMessageParts(message);
  const line = text || mediaLabel(t, media);
  return el(
    'div',
    {
      className: 'pinned-item',
      'data-pinned-item': networkMessageId(message),
    },
    [
      el(
        'button',
        {
          key: 'g',
          type: 'button',
          className: 'pinned-item-go',
          'data-action': 'pinned-go',
          onClick: () => onGo(message.id),
        },
        [
          el('strong', { key: 'n' }, message.senderName ?? ''),
          el(
            'span',
            { key: 'x', className: 'pinned-item-text' },
            line.length > 160 ? `${line.slice(0, 160)}…` : line
          ),
          el(
            'span',
            { key: 'd', className: 'meta' },
            message.timestamp ? dateTime(message.timestamp) : ''
          ),
        ]
      ),
      mayUnpinIt
        ? el(
            'button',
            {
              key: 'u',
              type: 'button',
              className: 'pinned-item-unpin',
              'data-action': 'pinned-unpin',
              onClick: () => onUnpin(message),
            },
            t('chat.pinnedList.unpin')
          )
        : null,
    ]
  );
};

const AskUnpinAll = ({ t, busy, failed, onYes, onNo }) => {
  useEsc(onNo);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.pinnedList.unpinAll'),
      'data-dialog': 'unpin-all',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.pinnedList.unpinAll')),
      el('p', { key: 'p' }, t('chat.pinnedList.unpinAllBody')),
      failed
        ? el('p', { key: 'e', role: 'alert' }, t('chat.pinnedList.err'))
        : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'n', type: 'button', 'data-action': 'cancel', onClick: onNo },
          t('chat.invite.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'unpin-all-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.pinnedList.unpinAllYes')
        ),
      ]),
    ])
  );
};

const ListFooter = ({ t, list, may, onAsk, onHide }) => [
  list.busy
    ? el('p', { key: 'l', className: 'meta' }, t('chat.common.loading'))
    : null,
  list.failed
    ? el(
        'p',
        { key: 'e', className: 'comments-failed', role: 'alert' },
        t('chat.pinnedList.err')
      )
    : null,
  list.next && !list.busy
    ? el(
        'button',
        {
          key: 'more',
          type: 'button',
          className: 'button',
          'data-action': 'pinned-more',
          onClick: list.more,
        },
        t('chat.common.more')
      )
    : null,
  el(
    'button',
    {
      key: 'foot',
      type: 'button',
      className: 'button pinned-list-foot',
      'data-action': may ? 'unpin-all' : 'pinned-hide',
      onClick: may ? onAsk : onHide,
    },
    may ? t('chat.pinnedList.unpinAll') : t('chat.pinnedList.hide')
  ),
];

const ListDialog = ({ api, chat, topic, list, may, onGo, onClose, onHide }) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [doing, setDoing] = useState({ busy: false, failed: false });
  const unpin = async (message) => {
    const answer = await api
      .telegramPin({
        chat: String(chat.chat),
        id: networkMessageId(message),
        unpin: true,
      })
      .catch(() => null);
    if (answer && !answer.error) {
      list.removed(message.id);
    }
  };
  const unpinAll = async () => {
    setDoing({ busy: true, failed: false });
    const answer = await api
      .telegramUnpinAll({
        chat: String(chat.chat),
        ...(topic ? { topMsgId: topic } : {}),
      })
      .catch(() => null);
    if (answer?.ok) {
      onHide();
      onClose();
    } else {
      setDoing({ busy: false, failed: true });
    }
  };
  return el(
    Frame,
    {
      title: t('chat.pinnedList.title', { count: list.count }),
      close: onClose,
      name: 'pinned-list',
    },
    [
      ...list.messages.map((message) =>
        el(Item, {
          key: message.id,
          message,
          mayUnpinIt: may,
          onGo,
          onUnpin: unpin,
        })
      ),
      ...ListFooter({
        t,
        list,
        may,
        onAsk: () => setAsking(true),
        onHide: () => {
          onHide();
          onClose();
        },
      }),
      asking
        ? el(AskUnpinAll, {
            key: 'ask',
            t,
            busy: doing.busy,
            failed: doing.failed,
            onYes: unpinAll,
            onNo: () => setAsking(false),
          })
        : null,
    ]
  );
};

const BarButton = ({ pinned, onOpen }) => {
  const t = useT();
  const { text, media } = parseMessageParts(pinned);
  const line = text || mediaLabel(t, media);
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-pinned-bar',
      onClick: () => onOpen(pinned.id),
    },
    [
      el('span', {
        key: 'bar',
        className: 'chat-pinned-line',
        'aria-hidden': 'true',
      }),
      el('span', { key: 'b', className: 'chat-pinned-body' }, [
        el(
          'span',
          { key: 'h', className: 'chat-pinned-title' },
          t('chat.pinnedMessage')
        ),
        el(
          'span',
          { key: 'x', className: 'chat-pinned-text' },
          line.length > 120 ? `${line.slice(0, 120)}…` : line
        ),
      ]),
      el(Icon, { key: 'i', name: 'pin', size: 18 }),
    ]
  );
};

/**
 * The chat's pinned message above the stream, as in Telegram: an accent
 * bar, "Pinned message" and one line of it; a click goes to it. With more
 * pinned a list button opens them all; whoever may not unpin can hide the
 * bar. `onOpen(id)` goes to a message.
 */
export const PinnedBar = ({ state, api, onOpen }) => {
  const t = useT();
  const { pinned, current, info } = state;
  const topic = state.forum?.topic ?? null;
  const [hidden, hide] = useHidden(current, topic, pinned?.id);
  const list = usePinnedList(api, current, topic, pinned?.id);
  const [open, setOpen] = useState(false);
  if (!pinned || hidden) {
    return null;
  }
  const may = mayUnpin(current, info);
  const several = list.count > 1;
  const asked = info?.kind !== undefined || current?.personal;
  return el('div', { className: 'chat-pinned-wrap' }, [
    el(BarButton, { key: 'bar', pinned, onOpen }),
    several
      ? el(
          'button',
          {
            key: 'list',
            type: 'button',
            className: 'icon-btn chat-pinned-side',
            'data-action': 'pinned-list-open',
            'aria-label': t('chat.pinnedList.title', { count: list.count }),
            title: t('chat.pinnedList.title', { count: list.count }),
            onClick: () => setOpen(true),
          },
          el(Icon, { name: 'menu', size: 18 })
        )
      : null,
    !several && !may && asked
      ? el(
          'button',
          {
            key: 'hide',
            type: 'button',
            className: 'icon-btn chat-pinned-side',
            'data-action': 'pinned-hide-bar',
            'aria-label': t('chat.pinnedList.hide'),
            title: t('chat.pinnedList.hide'),
            onClick: hide,
          },
          el(Icon, { name: 'close', size: 18 })
        )
      : null,
    open
      ? el(ListDialog, {
          key: 'dlg',
          api,
          chat: current,
          topic,
          list,
          may,
          onGo: (id) => {
            setOpen(false);
            onOpen(id);
          },
          onClose: () => setOpen(false),
          onHide: hide,
        })
      : null,
  ]);
};
