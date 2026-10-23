// Editing a chat's info, as Telegram Desktop lets those who may (R-Y129;
// learned, never copied): a group's or channel's creator, or an admin with
// the right to change info, gets "Edit" in the info column. A dialog in the
// page takes the name and the description, and the photo: "Set photo"
// picks an image, "Remove photo" clears it. Only what changed is sent.
// Once saved, the column shows the new name and description.

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { About, FormDialog, Title, errorText } from './chat-create.js';
import {
  ConvertGigagroup,
  TransferOwnership,
  canConvert,
  canTransfer,
} from './chat-moderation.js';

const el = React.createElement;

const EVENT = 'ms-chat-edited';
const edited = new Map();

/** What was saved for a chat this session: `{ title?, about? }`. */
export const useEdited = (key) => {
  const [, again] = useState(0);
  useEffect(() => {
    const on = () => again((n) => n + 1);
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  return edited.get(key) ?? {};
};

const remember = (key, change) => {
  edited.set(key, { ...edited.get(key), ...change });
  globalThis.dispatchEvent?.(new CustomEvent(EVENT));
};

/** Whether the info column offers Edit: Telegram says the user may. */
export const canEditInfo = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info?.canEdit);

// Uploads the picked image, returning its token, or the error code.
export const uploadPhoto = async (api, file) => {
  const sent = await api.telegramUpload(file).catch(() => null);
  return sent?.token
    ? { token: sent.token }
    : { code: sent?.code === 'too-large' ? 'photo-invalid' : 'failed' };
};

/** The photo's file box with Set photo and Remove photo (R-Y136 too). */
export const PhotoButtons = ({ t, onPick, onRemove, canRemove = true }) => {
  const input = useRef(null);
  return [
    el('input', {
      key: 'f',
      ref: input,
      type: 'file',
      accept: 'image/*',
      hidden: true,
      'data-field': 'photo',
      onChange: (event) => onPick(event.target.files?.[0] ?? null),
    }),
    el(
      'button',
      {
        key: 's',
        type: 'button',
        'data-action': 'set-photo',
        onClick: () => input.current?.click(),
      },
      t('chat.edit.setPhoto')
    ),
    canRemove
      ? el(
          'button',
          {
            key: 'r',
            type: 'button',
            'data-action': 'remove-photo',
            onClick: onRemove,
          },
          t('chat.edit.removePhoto')
        )
      : null,
  ];
};

const PhotoRow = ({ t, file, removed, onPick, onRemove }) =>
  el('div', { className: 'chat-form-photo' }, [
    el(PhotoButtons, { key: 'b', t, onPick, onRemove }),
    file || removed
      ? el(
          'span',
          { key: 'n', className: 'meta', 'data-photo-note': '' },
          file ? file.name : t('chat.edit.photoWillGo')
        )
      : null,
  ]);

const EditDialog = ({ api, chat, info, close }) => {
  const t = useT();
  const was = useEdited(chat.key);
  const first = {
    title: was.title ?? chat.name ?? '',
    about: was.about ?? info?.about ?? '',
  };
  const [title, setTitle] = useState(first.title);
  const [about, setAbout] = useState(first.about);
  const [file, setFile] = useState(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    const change = {};
    if (title !== first.title) {
      change.title = title;
    }
    if (about !== first.about) {
      change.about = about;
    }
    setBusy(true);
    if (file) {
      const up = await uploadPhoto(api, file);
      if (!up.token) {
        setBusy(false);
        setError(errorText(t, up.code));
        return;
      }
      change.photo = up.token;
    } else if (removed) {
      change.photo = 'remove';
    }
    if (Object.keys(change).length === 0) {
      close();
      return;
    }
    const answer = await api
      .telegramChatEdit({ chat: String(chat.chat), ...change })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      remember(chat.key, {
        ...(change.title === undefined ? {} : { title: change.title.trim() }),
        ...(change.about === undefined ? {} : { about: change.about }),
      });
      close();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el(
    FormDialog,
    {
      name: 'edit-chat',
      title: t('chat.edit.title'),
      onClose: close,
      onSubmit: save,
      submit: t('chat.edit.save'),
      busy,
      error,
    },
    [
      el(Title, {
        key: 't',
        label: t('chat.edit.name'),
        value: title,
        set: setTitle,
      }),
      el(About, {
        key: 'a',
        label: t('chat.edit.description'),
        value: about,
        set: setAbout,
      }),
      el(PhotoRow, {
        key: 'p',
        t,
        file,
        removed,
        onPick: (picked) => {
          setFile(picked);
          setRemoved(false);
        },
        onRemove: () => {
          setFile(null);
          setRemoved(true);
        },
      }),
      // The owner of a supergroup: a broadcast group (R-Y200).
      canConvert(chat, info, api)
        ? el(ConvertGigagroup, { key: 'g', api, chat })
        : null,
      // The owner may hand the chat over (R-Y200).
      canTransfer(chat, info, api)
        ? el(TransferOwnership, { key: 't2', api, chat })
        : null,
    ]
  );
};

/** "Edit" in the info column, for those who may; the dialog it opens. */
export const EditChat = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!canEditInfo(chat, info) || typeof api?.telegramChatEdit !== 'function') {
    return null;
  }
  return el('div', { className: 'chat-edit-bar' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'edit-chat',
        onClick: () => setOpen(true),
      },
      t('chat.edit.button')
    ),
    open
      ? el(EditDialog, {
          key: 'd',
          api,
          chat,
          info,
          close: () => setOpen(false),
        })
      : null,
  ]);
};
