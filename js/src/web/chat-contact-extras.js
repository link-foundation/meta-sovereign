// What a contact's profile column adds (R-Y217; learned, never copied),
// as the mobile clients have it: a private note (shown, edited and saved
// with contacts.updateContactNote), "Set photo for <name>" (only the user
// sees it) and "Suggest photo for <name>" (photos.uploadContactProfilePhoto
// with the picked image) with "Reset to original", and "Suggest birthday"
// when the contact has none (users.suggestBirthday). Nothing is sent but on
// the last click of a dialog (or Reset to original).

import React, { useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';
import { uploadPhoto } from './chat-edit.js';
import { BirthdayEditor } from './chat-profile-extras.js';
import { birthdayOfForm } from './profile-extras-model.js';

const el = React.createElement;

export const NOTE_MAX = 128;

// What the server last told of each contact's note and personal photo, so
// a reopened column does not show the older state the chat's info holds.
const known = new Map();

const errorText = (t, code) => {
  const key = `chat.contactExtras.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.contactExtras.err.failed') : text;
};

/** The contact's first name, as the buttons name them. */
export const firstNameOf = (chat) =>
  String(chat?.name ?? '').split(' ')[0] || String(chat?.chat ?? '');

/** Whether the column offers these: a known person in the contacts. */
export const offersContactExtras = (chat, info) =>
  chat?.source === 'telegram' &&
  /^\d+$/.test(String(chat.chat)) &&
  info?.kind === 'user' &&
  !info.self &&
  !info.bot &&
  Boolean(info.contact);

// A dialog whose submit sends `send()`; `done(answer)` runs on success.
const useSender = (t, send, done) => {
  const [state, setState] = useState({ busy: false, error: null });
  const submit = async () => {
    setState({ busy: true, error: null });
    const answer = await Promise.resolve(send()).catch(() => null);
    if (answer?.ok) {
      done(answer);
    } else {
      setState({ busy: false, error: errorText(t, answer?.code) });
    }
  };
  return { ...state, submit };
};

const NoteDialog = ({ api, chat, was, close, saved }) => {
  const t = useT();
  const [note, setNote] = useState(was);
  const sender = useSender(
    t,
    () => api.telegramContactNote({ chat: String(chat.chat), note }),
    (answer) => saved(answer.note ?? note.trim())
  );
  return el(
    FormDialog,
    {
      name: 'contact-note',
      title: t('chat.contactExtras.noteTitle'),
      onClose: close,
      onSubmit: sender.submit,
      submit: t('chat.contactExtras.save'),
      busy: sender.busy,
      error: sender.error,
      outside: true,
    },
    [
      el(
        'p',
        { key: 'h', className: 'meta' },
        t('chat.contactExtras.noteHint')
      ),
      el(Field, {
        key: 'n',
        label: t('chat.contactExtras.note'),
        name: 'note',
        area: true,
        autoFocus: true,
        value: note,
        maxLength: NOTE_MAX,
        onChange: (e) => setNote(e.target.value),
      }),
    ]
  );
};

const NoteRow = ({ api, chat, note, setNote }) => {
  const t = useT();
  const [editing, setEditing] = useState(false);
  return el('div', { className: 'contact-note', 'data-contact-note': '' }, [
    el('span', { key: 'l', className: 'meta' }, t('chat.contactExtras.note')),
    el(
      'span',
      { key: 'v', 'data-field': 'contact-note-text' },
      note || t('chat.contactExtras.noNote')
    ),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'peer-action',
        'data-action': 'contact-note-edit',
        onClick: () => setEditing(true),
      },
      note ? t('chat.contactExtras.noteEdit') : t('chat.contactExtras.noteAdd')
    ),
    editing
      ? el(NoteDialog, {
          key: 'd',
          api,
          chat,
          was: note,
          close: () => setEditing(false),
          saved: (next) => {
            setNote(next);
            setEditing(false);
          },
        })
      : null,
  ]);
};

// The picked image, kept until the dialog's button sends it.
const PhotoDialog = ({ api, chat, pick, close, done }) => {
  const t = useT();
  const name = firstNameOf(chat);
  const suggest = pick.mode === 'suggest';
  const sender = useSender(
    t,
    async () => {
      const up = await uploadPhoto(api, pick.file);
      return up.token
        ? api.telegramContactPhoto({
            chat: String(chat.chat),
            mode: pick.mode,
            token: up.token,
          })
        : up;
    },
    done
  );
  return el(
    FormDialog,
    {
      name: suggest ? 'contact-photo-suggest' : 'contact-photo-set',
      title: t(
        suggest
          ? 'chat.contactExtras.suggestPhoto'
          : 'chat.contactExtras.setPhoto',
        { name }
      ),
      onClose: close,
      onSubmit: sender.submit,
      submit: t(
        suggest
          ? 'chat.contactExtras.suggestSend'
          : 'chat.contactExtras.setSend'
      ),
      busy: sender.busy,
      error: sender.error,
      outside: true,
    },
    [
      el(
        'p',
        { key: 'h', className: 'meta' },
        t(
          suggest
            ? 'chat.contactExtras.suggestHint'
            : 'chat.contactExtras.setHint',
          {
            name,
          }
        )
      ),
      el('p', { key: 'f', 'data-photo-file': '' }, pick.file.name),
    ]
  );
};

const Action = ({ action, label, onClick }) =>
  el(
    'button',
    {
      type: 'button',
      className: 'peer-action',
      'data-action': action,
      onClick,
    },
    label
  );

const PhotoRows = ({ api, chat, personal, setPersonal }) => {
  const t = useT();
  const input = useRef(null);
  const mode = useRef('save');
  const [pick, setPick] = useState(null);
  const [message, setMessage] = useState(null);
  const name = firstNameOf(chat);
  const choose = (next) => () => {
    mode.current = next;
    input.current?.click();
  };
  const reset = async () => {
    const answer = await api
      .telegramContactPhoto({ chat: String(chat.chat), mode: 'reset' })
      .catch(() => null);
    setMessage(
      answer?.ok
        ? t('chat.contactExtras.photoReset')
        : errorText(t, answer?.code)
    );
    if (answer?.ok) {
      setPersonal(false);
    }
  };
  const done = (answer) => {
    setPick(null);
    setMessage(
      t(
        answer.mode === 'suggest'
          ? 'chat.contactExtras.suggested'
          : 'chat.contactExtras.photoSet'
      )
    );
    if (answer.mode === 'save') {
      setPersonal(true);
    }
  };
  return el('div', { className: 'contact-photo', 'data-contact-photo': '' }, [
    el('input', {
      key: 'f',
      ref: input,
      type: 'file',
      accept: 'image/*',
      hidden: true,
      'data-field': 'contact-photo-file',
      onChange: (e) => {
        const file = e.target.files?.[0] ?? null;
        e.target.value = '';
        setPick(file ? { file, mode: mode.current } : null);
      },
    }),
    el(Action, {
      key: 's',
      action: 'contact-photo-set',
      label: t('chat.contactExtras.setPhoto', { name }),
      onClick: choose('save'),
    }),
    el(Action, {
      key: 'g',
      action: 'contact-photo-suggest',
      label: t('chat.contactExtras.suggestPhoto', { name }),
      onClick: choose('suggest'),
    }),
    personal
      ? el(Action, {
          key: 'r',
          action: 'contact-photo-reset',
          label: t('chat.contactExtras.resetPhoto'),
          onClick: reset,
        })
      : null,
    message
      ? el(
          'p',
          {
            key: 'm',
            className: 'meta',
            role: 'status',
            'data-photo-note': '',
          },
          message
        )
      : null,
    pick
      ? el(PhotoDialog, {
          key: 'd',
          api,
          chat,
          pick,
          close: () => setPick(null),
          done,
        })
      : null,
  ]);
};

const BirthdayDialog = ({ api, chat, close, done }) => {
  const t = useT();
  const [form, setForm] = useState({ day: '', month: '', year: '' });
  const birthday = birthdayOfForm(form);
  const sender = useSender(
    t,
    () => api.telegramBirthdaySuggest({ chat: String(chat.chat), ...birthday }),
    done
  );
  return el(
    FormDialog,
    {
      name: 'suggest-birthday',
      title: t('chat.contactExtras.birthdayTitle', { name: firstNameOf(chat) }),
      onClose: close,
      onSubmit: birthday ? sender.submit : () => {},
      submit: t('chat.contactExtras.birthdaySend'),
      busy: sender.busy || !birthday,
      error: sender.error,
      outside: true,
    },
    el(BirthdayEditor, { t, form, set: setForm })
  );
};

const BirthdayRow = ({ api, chat }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  return el('div', { className: 'contact-birthday' }, [
    el(Action, {
      key: 'b',
      action: 'suggest-birthday',
      label: t('chat.contactExtras.birthday', { name: firstNameOf(chat) }),
      onClick: () => setOpen(true),
    }),
    sent
      ? el(
          'p',
          {
            key: 's',
            className: 'meta',
            role: 'status',
            'data-birthday-note': '',
          },
          t('chat.contactExtras.birthdaySent')
        )
      : null,
    open
      ? el(BirthdayDialog, {
          key: 'd',
          api,
          chat,
          close: () => setOpen(false),
          done: () => {
            setOpen(false);
            setSent(true);
          },
        })
      : null,
  ]);
};

/** The contact's note, photo buttons and Suggest birthday, or nothing. */
export const ContactExtras = ({ api, chat, info }) => {
  const key = String(chat?.chat);
  const seen = known.get(key) ?? {};
  const [note, setNoteState] = useState(seen.note ?? info?.note ?? '');
  const [personal, setPersonalState] = useState(
    seen.personal ?? Boolean(info?.personalPhoto)
  );
  if (
    !offersContactExtras(chat, info) ||
    typeof api?.telegramContactNote !== 'function'
  ) {
    return null;
  }
  const remember = (patch) => known.set(key, { ...known.get(key), ...patch });
  const setNote = (next) => {
    remember({ note: next });
    setNoteState(next);
  };
  const setPersonal = (next) => {
    remember({ personal: next });
    setPersonalState(next);
  };
  return el(
    'section',
    { className: 'person-section contact-extras', 'data-contact-extras': key },
    [
      el(NoteRow, { key: 'n', api, chat, note, setNote }),
      el(PhotoRows, { key: 'p', api, chat, personal, setPersonal }),
      info.birthday ? null : el(BirthdayRow, { key: 'b', api, chat }),
    ]
  );
};
