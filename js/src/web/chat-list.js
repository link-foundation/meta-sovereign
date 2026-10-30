// One row of the chat list, as Telegram draws it (R-Y68): the chat's
// photo, its name (with a mute mark), the time, who wrote last and what
// ("🙂 Sticker", "Photo"), and the unread count — grey when muted — or
// a pin; the "Archived Chats" row on top, and the archive's own head.

import React from 'react';
import { useDates, useT } from './i18n.js';
import { networkName } from './connection-guides.js';
import { Icon } from './icons.js';
import { PeerAvatar } from './peer-avatar.js';
import { EmojiStatus } from './emoji-status.js';
import { mediaLabel } from './chat-message.js';
import { parseMessageParts, strippedJpegDataUrl } from './message-parts.js';
import { mediaSrc } from './media-src.js';
import { FolderTags } from './chat-folder-tags.js';
import {
  accountDeleted,
  chatDisplayName,
  DeletedAccountBadge,
} from './chat-identity.js';

const el = React.createElement;

// A chat's photo, else its initials on its Telegram colour.
export const ChatAvatar = ({ api, chat, size = 's' }) => {
  const t = useT();
  if (accountDeleted(chat)) {
    return el(
      'span',
      {
        className: 'avatar peer-avatar deleted-account-avatar',
        'aria-hidden': true,
      },
      el(Icon, { name: 'user-x', size: size === 'b' ? 40 : 22 })
    );
  }
  return el(PeerAvatar, {
    api,
    source: chat.source,
    peer: String(chat.chat ?? ''),
    name: chatDisplayName(chat, t),
    size,
  });
};

// What the list says of the newest message, as Telegram does (R-Y68):
// who wrote it in a group ("You" for the user's own), then its text, or
// what it holds when it has none ("🙂 Sticker", "Photo"), with a small
// blurred picture of a photo or video.
// What the message holds when it has no text: "🙂 Sticker", "Photo".
const mediaWords = (t, media) => {
  const label = mediaLabel(t, media);
  return media.type === 'sticker' && media.emoji
    ? `${media.emoji} ${label}`
    : label;
};

// Who wrote it, where Telegram says: "You", or the member in a group.
const writer = (t, chat) => {
  if (chat.last.mine) {
    return t('chat.you');
  }
  return chat.kind === 'group' ? (chat.last.senderName ?? null) : null;
};

const thumbOf = (media) =>
  media?.kind === 'photo' || (media?.isVideo && media.type !== 'round')
    ? strippedJpegDataUrl(media.strippedB64)
    : null;

export const chatPreview = (t, chat) => {
  const { last } = chat;
  const parts = last.message ? parseMessageParts(last.message) : null;
  const plain = !parts || parts.service;
  const media = plain ? null : parts.media;
  let what = plain ? last.body : parts.text;
  if (!what && media) {
    what = mediaWords(t, media);
  }
  return {
    who: writer(t, chat),
    what: what === '📎' ? '' : (what ?? ''),
    thumb: thumbOf(media),
  };
};

// The unread count, @ for a mention, a heart for a reaction; grey when
// the chat is muted; a pin when nothing is unread in a pinned chat.
const ChatBadges = ({ chat, t }) => {
  const muted = chat.muted ? ' is-muted' : '';
  const marks = [
    chat.mentions > 0
      ? el(
          'span',
          {
            key: 'm',
            className: 'chat-item-mark',
            'aria-label': t('chat.mentions', { count: chat.mentions }),
          },
          '@'
        )
      : null,
    chat.reactions > 0
      ? el(
          'span',
          { key: 'r', className: 'chat-item-mark is-reaction' },
          el(Icon, { name: 'heart', size: 11 })
        )
      : null,
  ];
  if (chat.unread > 0) {
    return [
      ...marks,
      el(
        'span',
        {
          key: 'u',
          className: `chat-item-unread${muted}`,
          'data-unread': chat.unread,
          'aria-label': t('chat.unread', { count: chat.unread }),
        },
        String(chat.unread)
      ),
    ];
  }
  // Marked unread: Telegram's empty unread badge (R-Y97).
  if (chat.marked) {
    return [
      ...marks,
      el('span', {
        key: 'u',
        className: `chat-item-unread is-marked${muted}`,
        'data-unread': 'marked',
        'aria-label': t('chat.markedUnread'),
      }),
    ];
  }
  if (chat.pinned > 0) {
    return [
      ...marks,
      el(
        'span',
        {
          key: 'p',
          className: 'chat-item-pinned',
          'aria-label': t('chat.pinnedChat'),
        },
        el(Icon, { name: 'pin', size: 14 })
      ),
    ];
  }
  return [
    ...marks,
    el(
      'span',
      { key: 's', className: 'chat-item-source' },
      networkName(t, chat.source)
    ),
  ];
};

// The line under a chat's name: its draft in red, or its last message.
const PreviewLine = ({ t, preview, draft }) =>
  el(
    'span',
    { className: 'chat-item-preview' },
    draft
      ? [
          el(
            'span',
            { key: 'd', className: 'chat-item-draft' },
            `${t('chat.draftPrefix')} `
          ),
          draft.replace(/\s+/g, ' '),
        ]
      : [
          preview.who
            ? el(
                'span',
                { key: 'w', className: 'chat-item-sender' },
                `${preview.who}: `
              )
            : null,
          preview.thumb
            ? el('img', {
                key: 'i',
                className: 'chat-item-thumb',
                ...mediaSrc(preview.thumb),
                alt: '',
              })
            : null,
          preview.what,
        ]
  );

// `story`: 'unread' or 'seen' when the peer has stories (a ring, R-Y140);
// a click on the avatar then opens them (`onStory(peer)`, R-Y148).
// `onPinDown(event, chat)` starts the drag of a pinned row (R-Y159).
export const ChatItem = ({
  api,
  chat,
  active,
  onSelect,
  onMenu,
  story = '',
  onStory,
  onPinDown,
  tags,
}) => {
  const t = useT();
  const { chatTime } = useDates();
  const preview = chatPreview(t, chat);
  // The unsent text shows in place of the last message, except in the
  // chat that is open (its box holds it), as in Telegram Desktop (R-Y207).
  const draft = active ? '' : (chat.draft ?? '');
  return el(
    'button',
    {
      type: 'button',
      className: `chat-item${active ? ' active' : ''}${story ? ` has-story is-${story}` : ''}`,
      'data-chat': chat.key,
      'data-pinned': chat.pinned > 0 && onPinDown ? '' : undefined,
      // A pinned chat is dragged to a new place (R-Y159).
      onPointerDown:
        chat.pinned > 0 && onPinDown ? (e) => onPinDown(e, chat) : undefined,
      'aria-current': active ? 'true' : undefined,
      onClick: () => onSelect(chat.key),
      // Its menu, as in Telegram's list (R-Y97): pin, mute, archive…
      onContextMenu: onMenu
        ? (e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect?.();
            onMenu(
              chat,
              e.clientX || e.clientY
                ? { x: e.clientX, y: e.clientY }
                : { x: r?.left ?? 0, y: r?.bottom ?? 0 }
            );
          }
        : undefined,
    },
    [
      story
        ? el(
            'span',
            {
              key: 'a',
              className: 'chat-item-ring',
              role: 'link',
              'data-story-ring': chat.chat,
              'data-story-state': story,
              title: t('chat.stories.title'),
              onClick: (e) => {
                e.stopPropagation();
                onStory?.(String(chat.chat));
              },
            },
            el(ChatAvatar, { api, chat })
          )
        : el(ChatAvatar, { key: 'a', api, chat }),
      el('span', { key: 'b', className: 'chat-item-body' }, [
        el('span', { key: 'top', className: 'chat-item-top' }, [
          el('span', { key: 'n', className: 'chat-item-name' }, [
            el(
              'span',
              { key: 'x', className: 'chat-item-title' },
              chatDisplayName(chat, t)
            ),
            el(DeletedAccountBadge, { key: 'deleted', chat }),
            chat.emojiStatus
              ? el(EmojiStatus, { key: 'es', status: chat.emojiStatus, api })
              : null,
            // The folders' tags, when shown (R-Y180).
            el(FolderTags, { key: 'ft', tags }),
            chat.muted
              ? el(
                  'span',
                  {
                    key: 'm',
                    className: 'chat-item-muted',
                    'aria-label': t('chat.muted'),
                    title: t('chat.muted'),
                  },
                  el(Icon, { name: 'mute', size: 13 })
                )
              : null,
          ]),
          el(
            'span',
            { key: 't', className: 'chat-item-time' },
            chatTime(chat.last.at)
          ),
        ]),
        el('span', { key: 'bottom', className: 'chat-item-bottom' }, [
          el(PreviewLine, { key: 'p', t, preview, draft }),
          el(
            'span',
            { key: 'badges', className: 'chat-item-badges' },
            el(ChatBadges, { chat, t })
          ),
        ]),
      ]),
    ]
  );
};

// The row that opens the archive, as on top of Telegram's chat list:
// the archived chats' names, those with unread messages first, and
// their unread total in grey.
export const ArchiveItem = ({ archive, onOpen }) => {
  const t = useT();
  return el(
    'button',
    {
      type: 'button',
      className: 'chat-item chat-item-archive',
      'data-archive': '',
      onClick: onOpen,
    },
    [
      el(
        'span',
        { key: 'a', className: 'avatar peer-avatar archive-avatar' },
        el(Icon, { name: 'archive', size: 20 })
      ),
      el('span', { key: 'b', className: 'chat-item-body' }, [
        el('span', { key: 'top', className: 'chat-item-top' }, [
          el(
            'span',
            { key: 'n', className: 'chat-item-name' },
            t('chat.archive.title')
          ),
        ]),
        el('span', { key: 'bottom', className: 'chat-item-bottom' }, [
          el(
            'span',
            { key: 'p', className: 'chat-item-preview' },
            archive.names.join(', ')
          ),
          archive.unread > 0
            ? el(
                'span',
                {
                  key: 'u',
                  className: 'chat-item-unread is-muted',
                  'aria-label': t('chat.unread', { count: archive.unread }),
                },
                String(archive.unread)
              )
            : null,
        ]),
      ]),
    ]
  );
};

// Inside the archive: back to the main list, and its title.
export const ArchiveHead = ({ onBack }) => {
  const t = useT();
  return el('div', { className: 'chat-archive-head' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'ghost icon-btn',
        'aria-label': t('chat.archive.back'),
        title: t('chat.archive.back'),
        onClick: onBack,
      },
      el(Icon, { name: 'back', size: 18 })
    ),
    el('span', { key: 't' }, t('chat.archive.title')),
  ]);
};
