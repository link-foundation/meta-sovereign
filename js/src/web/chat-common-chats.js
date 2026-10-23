// "N groups in common" in a person's profile, as Telegram Desktop has it
// (R-Y158; learned, never copied): the row shows how many groups and
// channels the person and the user are both in (the profile's count) and
// opens their list — avatar, title, members when known — a page at a time
// ("Show more" asks the next page by the last chat's id). A click on one
// opens that chat in the app and closes the list.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { ChatAvatar } from './chat-list.js';

const el = React.createElement;

/** Whether the profile offers the row: a person with groups in common. */
export const hasCommonChats = (chat, info, api) =>
  chat?.source === 'telegram' &&
  /^\d+$/.test(String(chat.chat)) &&
  Number(info?.commonChats) > 0 &&
  typeof api?.telegramCommonChats === 'function';

/** The list after a page: new chats added, one already there kept once. */
export const mergeCommon = (list, page) => {
  const seen = new Set(list.map((c) => c.chat));
  return [...list, ...page.filter((c) => !seen.has(c.chat))];
};

/** What opening a listed chat asks of the app. */
export const targetOf = (item) => ({
  source: 'telegram',
  chat: item.chat,
  name: item.title,
  kind: item.kind === 'channel' ? 'channel' : 'group',
});

const useCommonList = (api, chat) => {
  const [state, setState] = useState({
    chats: [],
    next: null,
    busy: true,
    failed: false,
  });
  const load = (maxId) => {
    setState((s) => ({ ...s, busy: true, failed: false }));
    return api
      .telegramCommonChats({ chat, ...(maxId ? { maxId } : {}) })
      .catch(() => null)
      .then((answer) =>
        setState((s) =>
          answer?.ok
            ? {
                chats: mergeCommon(s.chats, answer.chats ?? []),
                next: answer.next ?? null,
                busy: false,
                failed: false,
              }
            : { ...s, busy: false, failed: true }
        )
      );
  };
  useEffect(() => {
    load(null);
  }, [api, chat]);
  return { ...state, more: () => load(state.next) };
};

const Item = ({ api, item, t, onPick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'common-chat',
      'data-common-chat': item.chat,
      onClick: () => onPick(item),
    },
    [
      el(ChatAvatar, {
        key: 'a',
        api,
        chat: { source: 'telegram', chat: item.chat, name: item.title },
      }),
      el('span', { key: 't', className: 'common-chat-text' }, [
        el('strong', { key: 'n' }, item.title),
        item.members
          ? el(
              'span',
              { key: 'm', className: 'meta' },
              t('chat.common.members', { count: item.members })
            )
          : null,
      ]),
    ]
  );

const CommonList = ({ api, chat, onPick, onClose }) => {
  const t = useT();
  const list = useCommonList(api, chat);
  return el(
    Frame,
    { title: t('chat.common.title'), close: onClose, name: 'common-chats' },
    [
      ...list.chats.map((item) =>
        el(Item, { key: item.chat, api, item, t, onPick })
      ),
      list.busy
        ? el('p', { key: 'l', className: 'meta' }, t('chat.common.loading'))
        : null,
      list.failed
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            t('chat.common.err')
          )
        : null,
      list.next && !list.busy
        ? el(
            'button',
            {
              key: 'more',
              type: 'button',
              className: 'button',
              'data-action': 'common-more',
              onClick: list.more,
            },
            t('chat.common.more')
          )
        : null,
    ]
  );
};

/** The profile's row; `onOpenChat(target)` opens a chat of the list. */
export const CommonChatsRow = ({ api, chat, info, onOpenChat }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!hasCommonChats(chat, info, api)) {
    return null;
  }
  return el('section', { className: 'person-section peer-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'peer-action',
        'data-action': 'common-chats-open',
        onClick: () => setOpen(true),
      },
      t('chat.common.row', { count: Number(info.commonChats) })
    ),
    open
      ? el(CommonList, {
          key: 'd',
          api,
          chat: String(chat.chat),
          onClose: () => setOpen(false),
          onPick: (item) => {
            setOpen(false);
            onOpenChat?.(targetOf(item));
          },
        })
      : null,
  ]);
};
