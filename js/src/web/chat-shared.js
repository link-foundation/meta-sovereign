// The profile column's top and its shared media (R-Y111), as Telegram's
// apps have them (learned, never copied): the chat's photo, name, what
// its header says, its @username and about text; then how many photos,
// videos, files, music, links, voice messages and GIFs the chat has —
// a row each, only those it has — each opening its list: photos, videos
// and GIFs as a grid of pictures, the rest as rows; more as the list is
// scrolled to its end; a click goes to the message in the chat; a link
// opens in a new tab.

import React, { useEffect, useRef, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Icon } from './icons.js';
import { Spinner } from './spinner.js';
import { ChatAvatar } from './chat-list.js';
import { EmojiStatus } from './emoji-status.js';
import { infoLine } from './chat-info.js';
import { parseMessageParts } from './message-parts.js';
import { mediaLabel } from './chat-message.js';
import { networkMessageId } from './chat-model.js';
import { useEdited } from './chat-edit.js';
import { ProfileFrame } from './chat-person-extras.js';
import { CollectibleRows } from './chat-collectible.js';
import {
  accountDeleted,
  identityChat,
  chatDisplayName,
  DeletedAccountBadge,
  TelegramUserId,
} from './chat-identity.js';

const el = React.createElement;

// In the column's order, each with its icon.
export const SHARED_ORDER = Object.freeze([
  ['photos', 'image'],
  ['videos', 'play'],
  ['files', 'file'],
  ['music', 'volume'],
  ['links', 'link'],
  ['voice', 'mic'],
  ['gifs', 'gif'],
]);

// The kinds drawn as a grid of pictures.
const GRID = new Set(['photos', 'videos', 'gifs']);

const telegramChat = (api, chat) =>
  chat?.source === 'telegram' && typeof api?.telegramSharedCounts === 'function'
    ? String(chat.chat)
    : null;

/** How many of each kind the chat has; null until known. */
export const useSharedCounts = (api, chat) => {
  const [counts, setCounts] = useState(null);
  const target = telegramChat(api, chat);
  useEffect(() => {
    setCounts(null);
    if (!target) {
      return undefined;
    }
    let live = true;
    api
      .telegramSharedCounts(target)
      .then((answer) => live && answer?.ok && setCounts(answer.counts))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, target]);
  return counts;
};

/** One kind's messages, newest first: `{ items, more, loading, next }`. */
export const useSharedList = (api, chat, kind) => {
  const [list, setList] = useState({ items: [], more: true, last: 0 });
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const target = telegramChat(api, chat);
  const next = async (reset = false) => {
    if (!target || !kind || busy.current || (!reset && !list.more)) {
      return;
    }
    busy.current = true;
    setLoading(true);
    const offsetId = reset ? 0 : list.last;
    const answer = await api
      .telegramSharedMedia({
        chat: target,
        kind,
        ...(offsetId ? { offsetId } : {}),
      })
      .catch(() => null);
    busy.current = false;
    setLoading(false);
    if (!answer?.ok) {
      setList((now) => ({ ...now, more: false }));
      return;
    }
    setList((now) => ({
      items: [...(reset ? [] : now.items), ...(answer.messages ?? [])],
      more: Boolean(answer.more),
      last: answer.last ?? 0,
    }));
  };
  useEffect(() => {
    setList({ items: [], more: true, last: 0 });
    next(true);
  }, [target, kind]);
  return { items: list.items, more: list.more, loading, next };
};

const profileStatus = (chat, info, t, chatTime) =>
  accountDeleted(chat, info)
    ? t('chat.account.deleted')
    : info
      ? infoLine(t, info, { kind: chat.kind, chatTime })
      : '';
const profileName = (chat, info, was, t) =>
  accountDeleted(chat, info)
    ? t('chat.account.deleted')
    : (was.title ?? chatDisplayName(chat, t, info));

/** The column's top: photo, name, status, @username, about text. */
export const ProfileHead = ({ api, chat, info }) => {
  const t = useT();
  const was = useEdited(chat.key);
  const { chatTime } = useDates();
  const status = profileStatus(chat, info, t, chatTime);
  return el(ProfileFrame, { api, info }, [
    el(ChatAvatar, {
      key: 'a',
      api,
      chat: identityChat(chat, info),
      size: 'b',
    }),
    el('div', { key: 'n', className: 'profile-name-row' }, [
      el(
        'strong',
        { key: 'n', className: 'profile-name' },
        profileName(chat, info, was, t)
      ),
      el(DeletedAccountBadge, { key: 'deleted', chat, info }),
      chat.emojiStatus
        ? el(EmojiStatus, { key: 'es', status: chat.emojiStatus, api })
        : null,
    ]),
    status
      ? el('span', { key: 's', className: 'meta profile-status' }, status)
      : null,
    el(TelegramUserId, { key: 'id', chat }),
    // A collectible username is a button to Fragment's card (R-Y194).
    el(CollectibleRows, { key: 'cr', api, info }),
    info?.username && !info.collectible?.usernames?.includes(info.username)
      ? el(
          'a',
          {
            key: 'u',
            className: 'profile-username',
            href: `https://t.me/${info.username}`,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          `@${info.username}`
        )
      : null,
    (was.about ?? info?.about)
      ? el(
          'p',
          { key: 'b', className: 'profile-about' },
          was.about ?? info.about
        )
      : null,
  ]);
};

// One kind's row: its icon and "12 photos".
const KindRow = ({ kind, icon, count, onOpen }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'shared-row',
      'data-shared': kind,
      onClick: onOpen,
    },
    [
      el(Icon, { key: 'i', name: icon, size: 18 }),
      el('span', { key: 't' }, t(`chat.shared.${kind}`, { count })),
    ]
  );
};

/**
 * The shared media: the rows, or the list of one kind. `onGo(id)` goes
 * to a message in the chat.
 */
export const SharedMedia = ({ api, chat, onGo }) => {
  const t = useT();
  const counts = useSharedCounts(api, chat);
  const [kind, setKind] = useState(null);
  useEffect(() => setKind(null), [chat?.key]);
  if (!telegramChat(api, chat)) {
    return null;
  }
  if (kind) {
    return el(SharedList, {
      api,
      chat,
      kind,
      count: counts?.[kind] ?? 0,
      onBack: () => setKind(null),
      onGo,
    });
  }
  const rows = SHARED_ORDER.filter(([k]) => (counts?.[k] ?? 0) > 0);
  return el(
    'section',
    { className: 'profile-shared', 'data-shared-rows': '' },
    [
      counts === null
        ? el(Spinner, { key: 'wait' })
        : rows.length === 0
          ? el('p', { key: 'none', className: 'meta' }, t('chat.shared.none'))
          : null,
      ...rows.map(([k, icon]) =>
        el(KindRow, {
          key: k,
          kind: k,
          icon,
          count: counts[k],
          onOpen: () => setKind(k),
        })
      ),
    ]
  );
};

// The end of a list, one screen before it shows, asks for more.
const useMoreAtEnd = (end, list) => {
  useEffect(() => {
    const Observer = globalThis.IntersectionObserver;
    const node = end.current;
    if (typeof Observer !== 'function' || !node || !list.more) {
      return undefined;
    }
    const observer = new Observer(
      (entries) => entries.some((e) => e.isIntersecting) && list.next(),
      { rootMargin: '100% 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [list.more, list.items.length, list.loading]);
};

const SharedList = ({ api, chat, kind, count, onBack, onGo }) => {
  const t = useT();
  const list = useSharedList(api, chat, kind);
  const end = useRef(null);
  useMoreAtEnd(end, list);
  const Item = GRID.has(kind) ? GridItem : RowItem;
  return el(
    'section',
    { className: 'profile-shared', 'data-shared-list': kind },
    [
      el('header', { key: 'h', className: 'shared-list-head' }, [
        el(
          'button',
          {
            key: 'b',
            type: 'button',
            className: 'icon-btn',
            'data-action': 'shared-back',
            'aria-label': t('chat.back'),
            title: t('chat.back'),
            onClick: onBack,
          },
          el(Icon, { name: 'back', size: 18 })
        ),
        el('strong', { key: 't' }, t(`chat.shared.${kind}`, { count })),
      ]),
      el(
        'div',
        {
          key: 'l',
          className: GRID.has(kind) ? 'shared-grid' : 'shared-items',
        },
        list.items.map((message) =>
          el(Item, { key: message.id, api, chat, message, onGo })
        )
      ),
      list.loading ? el(Spinner, { key: 'wait' }) : null,
      el('div', { key: 'end', ref: end, className: 'shared-end' }),
    ]
  );
};

// A picture of a photo, video or GIF; a click goes to its message.
const GridItem = ({ api, chat, message, onGo }) => {
  const t = useT();
  const [src, setSrc] = useState(null);
  const id = networkMessageId(message);
  useEffect(() => {
    let live = true;
    Promise.resolve(
      api.telegramMediaUrl?.({ chat: String(chat.chat), id, size: 'm' })
    ).then((url) => live && setSrc(url ?? null));
    return () => {
      live = false;
    };
  }, [id]);
  const { media } = parseMessageParts(message);
  return el(
    'button',
    {
      type: 'button',
      className: 'shared-cell',
      'data-shared-item': message.id,
      'aria-label': mediaLabel(t, media),
      onClick: () => onGo(message.id),
    },
    [
      src
        ? el('img', {
            key: 'i',
            src,
            alt: '',
            loading: 'lazy',
            decoding: 'async',
          })
        : null,
      media?.duration
        ? el(
            'span',
            { key: 'd', className: 'shared-cell-time' },
            clock(media.duration)
          )
        : null,
    ]
  );
};

const clock = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// The web links in a message's text, without the stop after them.
const LINKS = /https?:\/\/[^\s<>"')]+/giu;
export const linksIn = (text) => [
  ...new Set(
    (String(text ?? '').match(LINKS) ?? []).map((url) =>
      url.replace(/[.,;:!?]+$/u, '')
    )
  ),
];

// A file, a song, a voice message or a link, as a row; a click goes to
// its message, a link opens.
const RowItem = ({ message, onGo }) => {
  const t = useT();
  const { dateTime } = useDates();
  const { media, text } = parseMessageParts(message);
  const links = linksIn(message.body);
  const song = [media?.performer, media?.title].filter(Boolean).join(' — ');
  const title =
    media?.filename || song || links[0] || text || mediaLabel(t, media);
  return el(
    'div',
    { className: 'shared-item', 'data-shared-item': message.id },
    [
      el(
        'button',
        {
          key: 'go',
          type: 'button',
          className: 'shared-item-go',
          onClick: () => onGo(message.id),
        },
        [
          el('span', { key: 't', className: 'shared-item-title' }, title),
          el(
            'span',
            { key: 'd', className: 'meta' },
            dateTime(new Date(message.timestamp))
          ),
        ]
      ),
      ...links.slice(0, 3).map((url) =>
        el(
          'a',
          {
            key: url,
            className: 'shared-item-link',
            href: url,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          url
        )
      ),
    ]
  );
};
