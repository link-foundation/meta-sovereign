// A supergroup's own sticker set and emoji pack, as Telegram Desktop has
// them (R-Y211; learned, never copied): in "Edit" an admin who may change
// info (when Telegram says the group may have one) gets a "Group sticker
// set" row and a "Group emoji pack" row; each opens a dialog that takes a
// set's short name or its t.me/addstickers link, shows the set it finds
// (title and size) and saves it, or takes the set off. Members see the
// group's set in the sticker panel, first, under "Group stickers".

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog, Field } from './chat-create.js';
import { Grid, Section } from './chat-stickers.js';
import { useNearView } from './chat-media.js';
import { useRedrawOn } from './use-redraw.js';

const el = React.createElement;

const SHORT_NAME = /^[A-Za-z0-9_]{1,64}$/;
const LINK =
  /^(?:https?:\/\/)?(?:t|telegram)\.me\/add(?:stickers|emoji)\/([A-Za-z0-9_]{1,64})\/?(?:[?#].*)?$/i;
const TG_LINK = /^tg:\/\/add(?:stickers|emoji)\?set=([A-Za-z0-9_]{1,64})$/i;

/** The short name a typed name or t.me/addstickers link carries, or null. */
export const setNameOf = (input) => {
  const text = String(input ?? '').trim();
  const link = LINK.exec(text) ?? TG_LINK.exec(text);
  if (link) {
    return link[1];
  }
  return SHORT_NAME.test(text) ? text : null;
};

/** Whether the user may set the open group's sticker set (from its info). */
export const canSetGroupStickers = (chat, info, api) =>
  chat?.source === 'telegram' &&
  Boolean(info?.canSetStickers) &&
  typeof api?.telegramGroupStickerSet === 'function' &&
  typeof api?.telegramStickerSetBox === 'function';

// ---- What was saved this session ----------------------------------------

const EVENT = 'ms-group-sets';
const saved = new Map(); // chat key -> { stickers?, emojis? } (null: taken off)

export { useRedrawOn };

const remember = (key, kind, set) => {
  saved.set(key, { ...saved.get(key), [kind]: set });
  globalThis.dispatchEvent?.(new CustomEvent(EVENT));
};

/** The group's sets, `{ stickers, emojis }`, as saved here or its info says. */
export const useGroupSets = (key, info) => {
  useRedrawOn(EVENT);
  const own = saved.get(key) ?? {};
  const from = info?.groupStickers ?? {};
  return {
    stickers: 'stickers' in own ? own.stickers : (from.stickers ?? null),
    emojis: 'emojis' in own ? own.emojis : (from.emojis ?? null),
  };
};

// ---- The dialog ----------------------------------------------------------

const errorText = (t, code) => {
  const key = `chat.groupSet.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.groupSet.err.failed') : text;
};

// The set a typed name leads to, looked up once typing pauses.
const usePreview = (api, name) => {
  const [seen, setSeen] = useState({ name: null, set: null, failed: false });
  useEffect(() => {
    if (!name) {
      return undefined;
    }
    let live = true;
    const timer = globalThis.setTimeout(() => {
      Promise.resolve(api.telegramStickerSetBox({ shortName: name }))
        .then(
          (answer) =>
            live &&
            setSeen({
              name,
              set: answer?.ok ? answer.set : null,
              failed: !answer?.ok,
            })
        )
        .catch(() => live && setSeen({ name, set: null, failed: true }));
    }, 350);
    return () => {
      live = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, name]);
  return seen.name === name ? seen : { name, set: null, failed: false };
};

const Preview = ({ name, preview, t }) => {
  if (!name) {
    return null;
  }
  let text = t('chat.groupSet.looking');
  if (preview.set) {
    text = t('chat.groupSet.found', {
      title: preview.set.title,
      count: preview.set.count,
    });
  } else if (preview.failed) {
    text = t('chat.groupSet.notFound');
  }
  return el(
    'p',
    {
      className: 'meta group-set-preview',
      'data-group-set-preview': preview.set ? preview.set.shortName : '',
      role: 'status',
    },
    text
  );
};

const SetDialog = ({ api, chat, kind, current, close }) => {
  const t = useT();
  const [input, setInput] = useState(current?.shortName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const name = setNameOf(input);
  const preview = usePreview(api, name);
  const save = async (shortName) => {
    setBusy(true);
    const answer = await Promise.resolve(
      api.telegramGroupStickerSet({
        chat: String(chat.chat),
        shortName,
        emojis: kind === 'emojis',
      })
    ).catch(() => null);
    setBusy(false);
    if (!answer?.ok) {
      setError(errorText(t, answer?.code ?? 'failed'));
      return;
    }
    remember(
      chat.key,
      kind,
      shortName === null
        ? null
        : {
            id: preview.set.id,
            shortName,
            title: preview.set.title,
            count: preview.set.count,
          }
    );
    close();
  };
  const ready = Boolean(name && preview.set);
  return el(
    FormDialog,
    {
      name: `group-${kind}`,
      title: t(`chat.groupSet.${kind}Title`),
      submit: t('chat.edit.save'),
      onClose: close,
      onSubmit: () => ready && save(name),
      busy: busy || !ready,
      error,
    },
    [
      el(Field, {
        key: 'f',
        label: t('chat.groupSet.name'),
        name: 'set-name',
        value: input,
        placeholder: 'https://t.me/addstickers/…',
        autoFocus: true,
        onChange: (event) => {
          setInput(event.target.value);
          setError(null);
        },
      }),
      el(Preview, { key: 'p', name, preview, t }),
      el('p', { key: 'h', className: 'meta' }, t(`chat.groupSet.${kind}Hint`)),
      current
        ? el(
            'button',
            {
              key: 'x',
              type: 'button',
              className: 'danger',
              'data-action': 'group-set-remove',
              disabled: busy,
              onClick: () => save(null),
            },
            t('chat.groupSet.remove')
          )
        : null,
    ]
  );
};

// The dialog sits in the page's body, and its submit stays its own: Edit's
// form is the dialog's parent in the React tree, and would take it too.
export const aside = (node) =>
  createPortal(
    el(
      'div',
      { key: 'aside', onSubmit: (event) => event.stopPropagation() },
      node
    ),
    document.body
  );

/** The rows in "Edit": nothing unless the user may set the group's sets. */
export const GroupSetRows = ({ api, chat, info }) => {
  const t = useT();
  const sets = useGroupSets(chat?.key, info);
  const [open, setOpen] = useState(null);
  if (!canSetGroupStickers(chat, info, api)) {
    return null;
  }
  const row = (kind) =>
    el(
      'button',
      {
        key: kind,
        type: 'button',
        className: 'group-set-row',
        'data-action': `group-${kind}`,
        onClick: () => setOpen(kind),
      },
      [
        el('span', { key: 'l' }, t(`chat.groupSet.${kind}Title`)),
        el(
          'span',
          { key: 'v', className: 'meta' },
          sets[kind]?.title || t('chat.groupSet.none')
        ),
      ]
    );
  return el('div', { className: 'group-set-rows' }, [
    row('stickers'),
    row('emojis'),
    open
      ? aside(
          el(SetDialog, {
            key: `dialog:${open}`,
            api,
            chat,
            kind: open,
            current: sets[open],
            close: () => setOpen(null),
          })
        )
      : null,
  ]);
};

// ---- In the sticker panel ------------------------------------------------

/**
 * The group's sticker set as the panel's first section: its stickers asked
 * once the list is near; `set` is `{ shortName, title }`.
 */
export const GroupSetSection = ({ api, set, onSend, onMenu }) => {
  const t = useT();
  const ref = React.useRef(null);
  const { near } = useNearView(ref);
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!near || items) {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramStickerSetBox({ shortName: set.shortName }))
      .then((answer) => live && setItems(answer?.ok ? answer.items : []))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [api, set.shortName, near]);
  return el(
    'div',
    { ref },
    el(
      Section,
      { id: 'group', title: t('chat.groupSet.panel', { title: set.title }) },
      items
        ? el(Grid, { api, list: items, onSend, onMenu, where: 'set' })
        : el('div', {
            className: 'sticker-pending',
            style: {
              height: `${Math.ceil(Math.max(1, set.count) / 5) * 4.25}rem`,
            },
          })
    )
  );
};
