// Folder tags (R-Y180; Telegram's "Show folder tags", learned, never
// copied): when the switch is on, a small coloured tag with the folder's
// name stands on the row of every chat that is in a folder with a colour
// (DialogFilter.color, 0 to 6), except the folder that is open. The switch
// needs Premium (its refusal shows in words); a folder's colour is chosen
// in the folder editor.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { chatsInFolder } from './chat-folders.js';
import { TAG_COLORS, announceFolders } from './chat-folder-model.js';

const el = React.createElement;

/** Tags on one row at most. */
export const TAGS_MAX = 3;

/**
 * Chat key -> `[{ id, title, color }]`: the tags of every chat, but the
 * folder `exceptId` (the open one). Empty when no folder is a tag.
 */
export const tagMap = (chats, folders, people, exceptId = null) => {
  const tagged = folders.filter((f) => f.tag && f.id !== exceptId);
  const map = new Map();
  for (const folder of tagged) {
    for (const chat of chatsInFolder(chats, folder, people)) {
      const list = map.get(chat.key) ?? [];
      if (list.length < TAGS_MAX) {
        list.push({ id: folder.id, title: folder.title, color: folder.color });
        map.set(chat.key, list);
      }
    }
  }
  return map;
};

/** The tags on a chat's row. */
export const FolderTags = ({ tags }) =>
  tags?.length
    ? el(
        'span',
        { className: 'folder-tags', 'data-folder-tags': '' },
        tags.map((tag) =>
          el(
            'span',
            {
              key: tag.id,
              className: `folder-tag folder-tag-${tag.color}`,
              'data-folder-tag': tag.id,
            },
            tag.title
          )
        )
      )
    : null;

/** The colours to choose from for a folder, and none. */
export const ColorRow = ({ draft, setDraft }) => {
  const t = useT();
  return el(
    'div',
    {
      className: 'folder-colors',
      role: 'group',
      'aria-label': t('chat.folderTags.color'),
    },
    [null, ...Array.from({ length: TAG_COLORS }, (_, i) => i)].map((color) =>
      el(
        'button',
        {
          key: color ?? 'none',
          type: 'button',
          className: `folder-color folder-tag-${color ?? 'none'}${
            draft.color === color ? ' is-selected' : ''
          }`,
          'data-color': color ?? '',
          'aria-pressed': draft.color === color,
          'aria-label':
            color === null
              ? t('chat.folderTags.noColor')
              : t(`chat.folderTags.c${color}`),
          onClick: () => setDraft((d) => ({ ...d, color })),
        },
        color === null ? '×' : ''
      )
    )
  );
};

/**
 * "Show folder tags": a switch that asks when clicked (Premium); the
 * refusal stays as words and the switch where it was.
 */
export const FolderTagsToggle = ({ api, enabled }) => {
  const t = useT();
  const [shown, setShown] = useState(enabled);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (typeof api?.telegramFoldersTagsSet !== 'function') {
    return null;
  }
  const flip = async () => {
    setBusy(true);
    setError(null);
    const answer = await api
      .telegramFoldersTagsSet({ enabled: !shown })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setShown(answer.enabled);
      announceFolders();
    } else {
      const key = `chat.folderTags.err.${answer?.code ?? 'failed'}`;
      const text = t(key);
      setError(text === key ? t('chat.folderTags.err.failed') : text);
    }
  };
  return el('div', { className: 'folder-tags-toggle' }, [
    el('label', { key: 'l', className: 'check' }, [
      el('input', {
        key: 'i',
        type: 'checkbox',
        checked: shown,
        disabled: busy,
        'data-field': 'folder-tags',
        onChange: flip,
      }),
      ` ${t('chat.folderTags.show')}`,
    ]),
    el('p', { key: 'h', className: 'meta' }, t('chat.folderTags.hint')),
    error
      ? el(
          'p',
          { key: 'e', role: 'alert', className: 'chat-form-error' },
          error
        )
      : null,
  ]);
};
