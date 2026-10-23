// Reaction tags of Saved Messages (R-Y151; learned, never copied). In the
// user's own chat a row of chips above the history lists the reactions the
// saved messages are tagged with (the reaction, its name if it has one,
// how many). A click filters the history to the messages with that
// reaction: they replace the stream, and the "×" in the filter bar leaves
// the filter. A right-click on a chip names the tag (up to 12 characters,
// empty removes the name); that is Premium only, so without Premium the
// chips show a lock and the dialog says so. Telegram's refusals are told
// as text.

import React, { useCallback, useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Frame } from './chat-readers.js';
import { isSavedChat, savedBubbles } from './chat-saved.js';
import { networkMessageId } from './chat-model.js';

const el = React.createElement;

export const TITLE_MAX = 12;

/** A tag's reaction as a stable key. */
export const reactionKey = (reaction) =>
  reaction?.emoji ?? `custom:${reaction?.custom}`;

/** The glyph for a reaction; a custom emoji has none here. */
export const reactionGlyph = (reaction) => reaction?.emoji ?? '★';

const errorText = (t, code) => {
  const key = `chat.savedTags.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.savedTags.err.failed') : text;
};

// The tags of the open Saved Messages chat; `reload()` asks again.
const useTagList = (api, chatId) => {
  const [data, setData] = useState({ id: null, tags: [], premium: false });
  const reload = useCallback(async () => {
    if (!chatId) {
      return;
    }
    const answer = await api.telegramSavedTags().catch(() => null);
    setData(
      answer?.ok
        ? { id: chatId, tags: answer.tags, premium: Boolean(answer.premium) }
        : { id: chatId, tags: [], premium: false }
    );
  }, [api, chatId]);
  useEffect(() => {
    reload();
  }, [reload]);
  // A reaction just added may be a new tag: the bar asks again (R-Y173).
  useEffect(() => {
    globalThis.addEventListener?.('meta-reacted', reload);
    return () => globalThis.removeEventListener?.('meta-reacted', reload);
  }, [reload]);
  return [data.id === chatId ? data : { tags: [], premium: false }, reload];
};

// The messages with the chosen reaction, a page at a time (older on demand).
const useTagMessages = (api, chatId, tag) => {
  const [state, setState] = useState({ phase: 'idle', messages: [] });
  const key = tag ? reactionKey(tag.reaction) : null;
  const load = useCallback(
    async (before = null) => {
      const answer = await api
        .telegramSavedTagSearch({
          chat: chatId,
          reaction: tag.reaction,
          ...(before ? { offsetId: before } : {}),
        })
        .catch(() => null);
      setState((old) => {
        if (!answer?.ok) {
          return { ...old, phase: 'error', code: answer?.code ?? 'failed' };
        }
        const byId = new Map(
          [...(before ? old.messages : []), ...answer.messages].map((m) => [
            m.id,
            m,
          ])
        );
        const messages = [...byId.values()].sort(
          (a, b) => (networkMessageId(a) ?? 0) - (networkMessageId(b) ?? 0)
        );
        return { phase: 'ready', messages, more: Boolean(answer.more) };
      });
    },
    // The reaction is named by `key`; the tag object may be a new one.
    [api, chatId, key]
  );
  useEffect(() => {
    if (key) {
      setState({ phase: 'loading', messages: [] });
      load();
    } else {
      setState({ phase: 'idle', messages: [] });
    }
  }, [key, load]);
  return [state, load];
};

/** The Saved Messages tags of the open chat: `{ available, list, ... }`. */
export const useSavedTags = (api, chat, info) => {
  const available = isSavedChat(chat, info) && /^\d+$/.test(`${chat.chat}`);
  const chatId = available ? String(chat.chat) : null;
  const [data, reload] = useTagList(api, chatId);
  const [chosen, setChosen] = useState({ id: null, key: null });
  const [renaming, setRenaming] = useState(null);
  const active = data.tags.find(
    (tag) => chosen.id === chatId && reactionKey(tag.reaction) === chosen.key
  );
  const [found, more] = useTagMessages(api, chatId, active);
  return {
    available,
    chatId,
    tags: data.tags,
    premium: data.premium,
    active,
    found,
    more,
    reload,
    renaming,
    rename: setRenaming,
    choose: (tag) =>
      setChosen({ id: chatId, key: tag ? reactionKey(tag.reaction) : null }),
  };
};

const tagLabel = (t, tag) =>
  tag.title ? `${reactionGlyph(tag.reaction)} ${tag.title}` : '';

const Chip = ({ tag, tags, t }) => {
  const key = reactionKey(tag.reaction);
  const on = tags.active && reactionKey(tags.active.reaction) === key;
  return el(
    'button',
    {
      type: 'button',
      className: on ? 'saved-tag active' : 'saved-tag',
      'data-saved-tag': key,
      'aria-pressed': Boolean(on),
      title: tags.premium ? tagLabel(t, tag) : t('chat.savedTags.locked'),
      onClick: () => tags.choose(on ? null : tag),
      onContextMenu: (e) => {
        e.preventDefault();
        tags.rename(tag);
      },
    },
    [
      el('span', { key: 'r', className: 'saved-tag-reaction' }, [
        reactionGlyph(tag.reaction),
      ]),
      tag.title
        ? el('span', { key: 't', className: 'saved-tag-title' }, tag.title)
        : null,
      el('span', { key: 'c', className: 'meta saved-tag-count' }, tag.count),
      tags.premium ? null : el(Icon, { key: 'l', name: 'lock', size: 10 }),
    ]
  );
};

const RenameDialog = ({ tags, tag, t }) => {
  const [title, setTitle] = useState(tag.title);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null);
  const close = () => tags.rename(null);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setCode(null);
    const answer = await tags.api
      .telegramSavedTagRename({ reaction: tag.reaction, title: title.trim() })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      await tags.reload();
      close();
    } else {
      setCode(answer?.code ?? 'failed');
    }
  };
  return el(
    Frame,
    { title: t('chat.savedTags.renameTitle'), close, name: 'saved-tag-rename' },
    el('form', { className: 'admin-body', onSubmit: save }, [
      el('p', { key: 'g', className: 'saved-tag-big' }, [
        reactionGlyph(tag.reaction),
      ]),
      el('p', { key: 'h', className: 'meta' }, t('chat.savedTags.renameHint')),
      tags.premium
        ? null
        : el(
            'p',
            { key: 'p', className: 'meta', 'data-saved-tag-locked': true },
            [
              el(Icon, { key: 'i', name: 'lock', size: 12 }),
              ' ',
              t('chat.savedTags.premium'),
            ]
          ),
      el('input', {
        key: 'i',
        type: 'text',
        'data-field': 'saved-tag-title',
        'aria-label': t('chat.savedTags.renameField'),
        maxLength: TITLE_MAX,
        value: title,
        disabled: busy || !tags.premium,
        autoFocus: true,
        onChange: (e) => setTitle(e.target.value),
      }),
      code
        ? el(
            'p',
            { key: 'e', className: 'comments-failed', role: 'alert' },
            errorText(t, code)
          )
        : null,
      el(
        'button',
        {
          key: 's',
          type: 'submit',
          className: 'primary',
          'data-action': 'saved-tag-save',
          disabled: busy || !tags.premium,
        },
        t('chat.savedTags.save')
      ),
    ])
  );
};

/** The row of chips (and the rename dialog) above the history. */
export const SavedTagBar = ({ tags, api }) => {
  const t = useT();
  if (!tags.available || tags.tags.length === 0) {
    return null;
  }
  const withApi = { ...tags, api };
  return el('div', { className: 'saved-tags', 'data-saved-tags': true }, [
    el(
      'div',
      { key: 'row', className: 'saved-tags-row', role: 'group' },
      tags.tags.map((tag) =>
        el(Chip, { key: reactionKey(tag.reaction), tag, tags, t })
      )
    ),
    tags.renaming
      ? el(RenameDialog, { key: 'r', tags: withApi, tag: tags.renaming, t })
      : null,
  ]);
};

/** The history while a tag filters it: the found messages and the "×". */
export const SavedTagResults = ({ api, tags }) => {
  const t = useT();
  const { found, active } = tags;
  const list = found.messages;
  return el('div', { className: 'saved-view', 'data-saved': 'tag' }, [
    el('div', { key: 'h', className: 'saved-head' }, [
      el(
        'strong',
        { key: 'n', className: 'saved-head-name' },
        t('chat.savedTags.filtering', { tag: reactionGlyph(active.reaction) })
      ),
      el(
        'button',
        {
          key: 'x',
          type: 'button',
          className: 'icon-btn',
          'data-action': 'saved-tag-clear',
          'aria-label': t('chat.savedTags.clear'),
          title: t('chat.savedTags.clear'),
          onClick: () => tags.choose(null),
        },
        '×'
      ),
    ]),
    el('div', { key: 's', className: 'comments-scroll' }, [
      el('div', { key: 'c', className: 'chat-column comments-column' }, [
        found.phase === 'ready' && found.more && list.length > 0
          ? el(
              'button',
              {
                key: 'older',
                type: 'button',
                className: 'comments-older',
                'data-action': 'saved-tag-older',
                onClick: () => tags.more(networkMessageId(list[0])),
              },
              t('chat.savedTags.more')
            )
          : null,
        found.phase === 'loading'
          ? el(
              'p',
              { key: 'l', className: 'meta' },
              t('chat.savedTags.loading')
            )
          : null,
        found.phase === 'ready' && list.length === 0
          ? el('p', { key: 'e', className: 'meta' }, t('chat.savedTags.empty'))
          : null,
        found.phase === 'error'
          ? el(
              'p',
              { key: 'f', className: 'comments-failed', role: 'alert' },
              errorText(t, found.code)
            )
          : null,
        ...savedBubbles(api, list),
      ]),
    ]),
  ]);
};
