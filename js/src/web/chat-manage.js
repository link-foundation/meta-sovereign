// Managing a channel or group from "Edit", as Telegram Desktop lets its
// owner and admins (R-Y216; learned, never copied):
// - "Channel type" / "Group type": the public link (chat-public-link.js);
// - "Appearance": the channel's name colour and profile colour with a
//   background emoji, and its emoji status, reusing the pickers of the
//   user's own profile; Telegram's BOOSTS_REQUIRED is told in words;
// - "Delete channel" / "Delete group" for the owner, behind a dialog naming
//   the chat that says it cannot be undone; the chat then leaves the list.
// Each dialog sits in the page's body (Edit's form is its React parent).

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { useEsc } from './chat-invite.js';
import { aside } from './chat-group-stickers.js';
import { usePalettes } from './chat-person-extras.js';
import { ColorEditor, colorBody, sameColor } from './chat-profile-extras.js';
import { EmojiStatusDialog, EmojiStatusRow } from './chat-emoji-status.js';
import {
  PublicLinkDialog,
  canSetType,
  errorText,
  publicNameOf,
} from './chat-public-link.js';

const el = React.createElement;

const EMOJI_CHOICES = 12;

/** Whether the owner may delete the chat for everyone. */
export const canDestroy = (chat, info, api) =>
  /^-\d+$/.test(String(chat?.chat)) &&
  Boolean(info?.owner) &&
  typeof api?.telegramRemoveChat === 'function';

/** Whether the user may change the channel's colours and emoji status. */
export const canLook = (chat, info, api) =>
  /^-100\d+$/.test(String(chat?.chat)) &&
  Boolean(info?.canAppearance) &&
  typeof api?.telegramChannelColorSave === 'function';

// ---- The delete dialog ---------------------------------------------------

const DeleteDialog = ({ api, chat, info, close, done }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEsc(close);
  const kind = info?.broadcast ? 'Channel' : 'Group';
  const yes = async () => {
    setBusy(true);
    const answer = await api
      .telegramRemoveChat({ chat: String(chat.chat), action: 'destroy' })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done();
    } else {
      setError(errorText(t, answer?.code ?? answer?.error ?? 'failed'));
    }
  };
  const name = chat.name || String(chat.chat);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t(`chat.manage.delete${kind}`),
      'data-dialog': 'delete-chat',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t(`chat.manage.delete${kind}Title`, { name })),
      el('p', { key: 'p' }, t('chat.manage.deleteBody', { name })),
      error ? el('p', { key: 'e', role: 'alert' }, error) : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'n', type: 'button', 'data-action': 'cancel', onClick: close },
          t('chat.create.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'delete-confirm',
            disabled: busy,
            onClick: yes,
          },
          t('chat.manage.deleteConfirm')
        ),
      ]),
    ])
  );
};

// ---- Appearance ----------------------------------------------------------

// What was saved this session, by chat key: { color, profileColor, status }.
const looks = new Map();

const startOf = (key, info) => {
  const look = { ...info?.look, ...looks.get(key) };
  const pick = (value) => ({
    color: value?.color ?? null,
    emoji: value?.emoji ?? null,
  });
  return {
    color: pick(look.color),
    profileColor: pick(look.profileColor),
    status: look.status ?? null,
  };
};

// The background emoji offered: the default statuses' ids, asked once.
const useEmoji = (api) => {
  const [ids, setIds] = useState([]);
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramEmojiStatuses?.())
      .catch(() => null)
      .then(
        (answer) =>
          live &&
          answer?.ok &&
          setIds(
            (answer.defaults ?? []).slice(0, EMOJI_CHOICES).map((s) => s.id)
          )
      );
    return () => {
      live = false;
    };
  }, [api]);
  return ids;
};

const LookDialog = ({ api, chat, info, close }) => {
  const t = useT();
  const palettes = usePalettes(api);
  const emoji = useEmoji(api);
  const was = startOf(chat.key, info);
  const [form, setForm] = useState(was);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => {
    const writes = [
      ['color', false],
      ['profileColor', true],
    ].filter(([key]) => !sameColor(was[key], form[key]));
    setBusy(true);
    for (const [key, forProfile] of writes) {
      const answer = await api
        .telegramChannelColorSave({
          chat: String(chat.chat),
          ...colorBody(forProfile, form[key]),
        })
        .catch(() => null);
      if (!answer?.ok) {
        setBusy(false);
        setError(errorText(t, answer?.code ?? 'failed'));
        return;
      }
      looks.set(chat.key, { ...looks.get(chat.key), [key]: form[key] });
    }
    setBusy(false);
    close();
  };
  const editor = (kind, key) =>
    el(ColorEditor, {
      key: kind,
      api,
      t,
      kind,
      premium: true,
      palette: palettes[kind],
      emoji,
      value: form[key],
      set: (next) => setForm({ ...form, [key]: next }),
      name: chat.name ?? '',
    });
  return el(
    FormDialog,
    {
      name: 'chat-look',
      title: t('chat.manage.lookTitle'),
      onClose: close,
      onSubmit: save,
      submit: t('chat.edit.save'),
      busy,
      error,
      outside: true,
    },
    [
      editor('name', 'color'),
      editor('profile', 'profileColor'),
      el(EmojiStatusRow, {
        key: 'st',
        api,
        status: form.status,
        onOpen: () => setPicking(true),
      }),
      picking
        ? aside(
            el(EmojiStatusDialog, {
              key: 'sd',
              api,
              chat: chat.chat,
              current: form.status,
              close: () => setPicking(false),
              onChange: (status) => {
                setForm((now) => ({ ...now, status }));
                looks.set(chat.key, { ...looks.get(chat.key), status });
              },
            })
          )
        : null,
    ]
  );
};

// ---- The rows in Edit ----------------------------------------------------

const Row = ({ action, label, value, onOpen, danger = false }) =>
  el(
    'button',
    {
      type: 'button',
      className: `group-set-row${danger ? ' danger' : ''}`,
      'data-action': action,
      onClick: onOpen,
    },
    [
      el('span', { key: 'l' }, label),
      value ? el('span', { key: 'v', className: 'meta' }, value) : null,
    ]
  );

/** The rows of "Edit": type, appearance and delete, for those who may. */
export const ManageRows = ({ api, chat, info, leave }) => {
  const t = useT();
  const [open, setOpen] = useState(null);
  const type = canSetType(chat, info, api);
  const look = canLook(chat, info, api);
  const destroy = canDestroy(chat, info, api);
  if (!type && !look && !destroy) {
    return null;
  }
  const broadcast = Boolean(info?.broadcast);
  const link = publicNameOf(chat.key, info);
  const dialogs = {
    type: PublicLinkDialog,
    look: LookDialog,
    delete: DeleteDialog,
  };
  const Dialog = open ? dialogs[open] : null;
  return el('div', { className: 'group-set-rows chat-manage-rows' }, [
    type
      ? el(Row, {
          key: 'type',
          action: 'chat-type',
          label: t(
            broadcast ? 'chat.manage.typeChannel' : 'chat.manage.typeGroup'
          ),
          value: link ? `t.me/${link}` : t('chat.manage.private'),
          onOpen: () => setOpen('type'),
        })
      : null,
    look
      ? el(Row, {
          key: 'look',
          action: 'chat-look',
          label: t('chat.manage.look'),
          onOpen: () => setOpen('look'),
        })
      : null,
    destroy
      ? el(Row, {
          key: 'delete',
          action: 'delete-chat',
          label: t(
            broadcast ? 'chat.manage.deleteChannel' : 'chat.manage.deleteGroup'
          ),
          danger: true,
          onOpen: () => setOpen('delete'),
        })
      : null,
    Dialog
      ? aside(
          el(Dialog, {
            key: `dialog:${open}`,
            api,
            chat,
            info,
            close: () => setOpen(null),
            done: leave,
          })
        )
      : null,
  ]);
};
