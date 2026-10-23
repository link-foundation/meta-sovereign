// A forum group as its whole list of messages, or as its topics (R-Y171;
// learned, never copied), as Telegram Desktop's ⋯ menu has it: "View as
// messages" hides the topics' strip and shows every message of the group,
// "View as topics" brings the strip back. The flag comes from Telegram
// with the chat's info (channelFull view_forum_as_messages) and is
// followed on load; the view switches at once on a click, and the one
// server write (channels.toggleViewForumAsMessages) is made only then.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';

const el = React.createElement;

/**
 * `{ available, asMessages, toggle }` for the open chat: `asMessages`
 * the view now (Telegram's flag until a click), `toggle` switches it at
 * once and tells Telegram, taking it back when Telegram refuses.
 */
export const useForumView = ({ api, state }) => {
  const chat = state.current;
  const key = chat?.key ?? null;
  const [chosen, setChosen] = useState(() => new Map());
  const available =
    Boolean(state.forum?.forum) &&
    chat?.source === 'telegram' &&
    typeof api?.telegramForumView === 'function';
  const asMessages =
    available && (chosen.get(key) ?? Boolean(state.info?.forumAsMessages));
  const set = (value) => setChosen((before) => new Map(before).set(key, value));
  const toggle = async () => {
    const next = !asMessages;
    set(next);
    if (next) {
      state.forum.choose?.(null);
    }
    const answer = await Promise.resolve(
      api.telegramForumView({ chat: String(chat.chat), asMessages: next })
    ).catch((error) => ({ error: error.message }));
    if (!answer?.ok) {
      set(!next);
      state.notify?.({
        kind: 'failed',
        code: answer?.code,
        error: answer?.error ?? 'not changed',
        retryAfter: answer?.retryAfter,
      });
    }
  };
  return { available, asMessages, toggle };
};

/** The forum the topics' strip shows: none while it is viewed as messages. */
export const stripForum = (view, forum) => (view.asMessages ? null : forum);

/** The header's ⋯ button and its menu with the one item. */
export const ForumViewMenu = ({ view }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!view?.available) {
    return null;
  }
  const label = t(
    view.asMessages ? 'chat.forumView.asTopics' : 'chat.forumView.asMessages'
  );
  return el('div', { className: 'chat-menu forum-view-menu' }, [
    el(
      'button',
      {
        key: 'more',
        type: 'button',
        className: 'icon-btn',
        'data-action': 'forum-menu',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': t('chat.forumView.menu'),
        title: t('chat.forumView.menu'),
        onClick: () => setOpen((now) => !now),
      },
      el(Icon, { name: 'more' })
    ),
    open
      ? el(
          'div',
          { key: 'list', className: 'forum-view-list', role: 'menu' },
          el(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              className: 'forum-view-item',
              'data-action': 'forum-view',
              onClick: () => {
                setOpen(false);
                view.toggle();
              },
            },
            label
          )
        )
      : null,
  ]);
};
