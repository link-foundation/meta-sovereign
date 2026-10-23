// Several usernames (R-Y170; learned, never copied), as Telegram Desktop's
// profile and channel settings show them: every username with its t.me
// link; the active ones can be moved up or down (or dragged) to a new
// place, and the collectible ones activated or deactivated. The editable
// username stays edited where it was. Each change is one request, made on
// the click that asks for it. Used by the user's own profile card and, for a
// channel or supergroup the user owns, by "Usernames" in the info column.

import React, { useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import {
  activeOrder,
  arranged,
  hasExtra,
  linkOf,
  movedActive,
  toggledName,
} from './usernames-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.usernames.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.usernames.err.failed') : text;
};

const Row = ({ t, item, index, count, busy, act, drag }) => {
  const name = item.username;
  return el(
    'li',
    {
      className: item.active ? 'username-row' : 'username-row is-inactive',
      'data-username': name,
      'data-active': item.active,
      draggable: item.active && !busy,
      onDragStart: () => {
        drag.current = index;
      },
      onDragOver: (event) => item.active && event.preventDefault(),
      onDrop: (event) => {
        event.preventDefault();
        if (item.active && drag.current !== null) {
          act.move(drag.current, index);
        }
        drag.current = null;
      },
    },
    [
      el(
        'a',
        {
          key: 'a',
          className: 'username-link',
          href: linkOf(name),
          target: '_blank',
          rel: 'noopener noreferrer',
          'data-username-link': name,
        },
        `t.me/${name}`
      ),
      item.editable
        ? el(
            'span',
            { key: 'm', className: 'meta' },
            t('chat.usernames.editable')
          )
        : null,
      item.active
        ? el('span', { key: 'mv', className: 'username-moves' }, [
            el(
              'button',
              {
                key: 'u',
                type: 'button',
                disabled: busy || index === 0,
                'data-action': 'username-up',
                'aria-label': t('chat.usernames.up', { name }),
                onClick: () => act.move(index, index - 1),
              },
              '↑'
            ),
            el(
              'button',
              {
                key: 'd',
                type: 'button',
                disabled: busy || index === count - 1,
                'data-action': 'username-down',
                'aria-label': t('chat.usernames.down', { name }),
                onClick: () => act.move(index, index + 1),
              },
              '↓'
            ),
          ])
        : null,
      item.editable
        ? null
        : el(
            'button',
            {
              key: 't',
              type: 'button',
              disabled: busy,
              'data-action': item.active
                ? 'username-deactivate'
                : 'username-activate',
              onClick: () => act.toggle(name, !item.active),
            },
            item.active
              ? t('chat.usernames.deactivate')
              : t('chat.usernames.activate')
          ),
    ]
  );
};

// The list and the two requests that change it: `chat` is the channel's id,
// or absent for the user's own usernames.
const useUsernames = (api, chat, initial) => {
  const [list, setList] = useState(() => arranged(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (next, ask) => {
    setError(null);
    setBusy(true);
    const answer = await ask().catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setList(next);
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const target = chat ? { chat: String(chat) } : {};
  const act = {
    move: (from, to) => {
      const next = movedActive(list, from, to);
      if (
        next !== list &&
        activeOrder(next).join() !== activeOrder(list).join()
      ) {
        run(next, () =>
          api.telegramUsernamesReorder({ order: activeOrder(next), ...target })
        );
      }
    },
    toggle: (username, active) =>
      run(toggledName(list, username, active), () =>
        api.telegramUsernameToggle({ username, active, ...target })
      ),
  };
  return { list, busy, error, act };
};

/** The usernames with their links and controls; `chat` for a channel's. */
export const UsernamesEditor = ({ api, chat, usernames }) => {
  const t = useT();
  const drag = useRef(null);
  const { list, busy, error, act } = useUsernames(api, chat, usernames);
  const count = activeOrder(list).length;
  return el('div', { className: 'usernames-editor' }, [
    el('p', { key: 'h', className: 'meta' }, t('chat.usernames.hint')),
    error
      ? el(
          'p',
          {
            key: 'e',
            className: 'comments-failed',
            role: 'alert',
            'data-usernames-error': error,
          },
          errorText(t, error)
        )
      : null,
    el(
      'ul',
      { key: 'l', className: 'usernames-list', 'data-usernames': 'list' },
      list.map((item, index) =>
        el(Row, { key: item.username, t, item, index, count, busy, act, drag })
      )
    ),
  ]);
};

/** The editor in a profile card, when there is more than the editable one. */
export const ProfileUsernames = ({ api, usernames }) => {
  const t = useT();
  if (
    !hasExtra(usernames) ||
    typeof api?.telegramUsernameToggle !== 'function'
  ) {
    return null;
  }
  return el('div', { className: 'profile-usernames' }, [
    el('strong', { key: 'h' }, t('chat.usernames.title')),
    el(UsernamesEditor, { key: 'e', api, usernames }),
  ]);
};

/** "Usernames" in the info column of a channel or supergroup the user owns. */
export const UsernamesAction = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (
    chat?.source !== 'telegram' ||
    !info?.canEditUsernames ||
    !hasExtra(info.usernames) ||
    typeof api?.telegramUsernameToggle !== 'function'
  ) {
    return null;
  }
  return el('div', { className: 'admin-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'admin-open',
        'data-action': 'chat-usernames',
        onClick: () => setOpen(true),
      },
      t('chat.usernames.open')
    ),
    open
      ? el(
          Frame,
          {
            key: 'd',
            title: t('chat.usernames.title'),
            close: () => setOpen(false),
            name: 'chat-usernames',
          },
          el('div', { className: 'admin-body' }, [
            el(UsernamesEditor, {
              key: 'e',
              api,
              chat: chat.chat,
              usernames: info.usernames,
            }),
          ])
        )
      : null,
  ]);
};
