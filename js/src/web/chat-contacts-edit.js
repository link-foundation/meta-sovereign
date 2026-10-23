// Close friends and adding a contact by phone number, as Telegram
// Desktop has them (R-Y169; learned, never copied). Close friends: the
// contacts with a check for each, the current close friends checked;
// Save sends exactly the checked ones. Add contact: first name, last
// name and phone number; if the number is not on Telegram the dialog
// says so in words, else the new contact shows with a button that opens
// its chat.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Field, FormDialog, Picker } from './chat-create.js';
import { openChat } from './chat-state.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.contactsEdit.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.contactsEdit.err.failed') : text;
};

// The contacts and who of them is a close friend, asked once.
const useCloseFriends = (api) => {
  const [state, setState] = useState({ phase: 'loading', contacts: [] });
  useEffect(() => {
    let live = true;
    api
      .telegramCloseFriends()
      .then(
        (a) =>
          live &&
          setState(
            a?.ok
              ? { phase: 'ready', contacts: a.contacts ?? [] }
              : { phase: 'error', contacts: [], code: a?.code }
          )
      )
      .catch(() => live && setState({ phase: 'error', contacts: [] }));
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

/** The ids of the contacts that are close friends. */
export const closeIds = (contacts) =>
  contacts.filter((c) => c.closeFriend).map((c) => c.id);

/** The close friends editor: Save sends exactly the checked contacts. */
export const CloseFriendsDialog = ({ api, close }) => {
  const t = useT();
  const state = useCloseFriends(api);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const ready = state.phase === 'ready';
  const current = picked ?? new Set(closeIds(state.contacts));
  const toggle = (id) => {
    setSaved(false);
    setPicked((was) => {
      const next = new Set(was ?? closeIds(state.contacts));
      return next.delete(id) ? next : next.add(id);
    });
  };
  const save = async () => {
    setBusy(true);
    const answer = await api
      .telegramCloseFriendsSet({ ids: [...current] })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setError(null);
      setSaved(true);
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  let body = el(
    'p',
    { className: 'meta' },
    t(
      state.phase === 'loading'
        ? 'chat.contactsEdit.loading'
        : 'chat.contactsEdit.err.failed'
    )
  );
  if (ready) {
    body = el(Picker, { contacts: state.contacts, picked: current, toggle, t });
  }
  return el(
    FormDialog,
    {
      name: 'close-friends',
      title: t('chat.contactsEdit.closeFriends'),
      onClose: close,
      onSubmit: save,
      submit: t('chat.contactsEdit.save'),
      busy: busy || !ready,
      error,
      outside: true,
    },
    [
      el(
        'p',
        { key: 'h', className: 'meta' },
        t('chat.contactsEdit.closeHint')
      ),
      body,
      saved
        ? el(
            'p',
            { key: 's', className: 'meta', role: 'status', 'data-saved': true },
            t('chat.contactsEdit.saved', { count: current.size })
          )
        : null,
    ]
  );
};

const fieldsOf = (form, set, t) => [
  el(Field, {
    key: 'f',
    label: t('chat.contactsEdit.firstName'),
    name: 'firstName',
    value: form.firstName,
    maxLength: 64,
    autoFocus: true,
    onChange: (e) => set({ ...form, firstName: e.target.value }),
  }),
  el(Field, {
    key: 'l',
    label: t('chat.contactsEdit.lastName'),
    name: 'lastName',
    value: form.lastName,
    maxLength: 64,
    onChange: (e) => set({ ...form, lastName: e.target.value }),
  }),
  el(Field, {
    key: 'p',
    label: t('chat.contactsEdit.phone'),
    name: 'phone',
    type: 'tel',
    value: form.phone,
    maxLength: 24,
    placeholder: '+15551234567',
    onChange: (e) => set({ ...form, phone: e.target.value }),
  }),
];

/** Whether the form can be sent: a first name and a number with a "+". */
export const validForm = (form) =>
  form.firstName.trim() !== '' &&
  /^\+\d{5,20}$/.test(form.phone.replace(/[\s()-]/g, ''));

/** The answer as the dialog shows it: `notFound`, `added` or an error. */
export const outcomeOf = (answer) => {
  if (!answer?.ok) {
    return { kind: 'error', code: answer?.code ?? 'failed' };
  }
  return answer.found
    ? { kind: 'added', contact: answer.contact, chat: answer.chat }
    : { kind: 'notFound' };
};

/** "Add contact": name and number; the result in words. */
export const AddContactDialog = ({ api, close }) => {
  const t = useT();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const submit = async () => {
    if (!validForm(form)) {
      setOutcome({
        kind: 'error',
        code: form.firstName.trim() === '' ? 'name-empty' : 'phone-invalid',
      });
      return;
    }
    setBusy(true);
    const answer = await api.telegramContactImport(form).catch(() => null);
    setBusy(false);
    setOutcome(outcomeOf(answer));
  };
  const added = outcome?.kind === 'added';
  return el(
    FormDialog,
    {
      name: 'add-contact',
      title: t('chat.contactsEdit.addContact'),
      onClose: close,
      onSubmit: added ? close : submit,
      submit: added ? t('chat.contactsEdit.done') : t('chat.contactsEdit.add'),
      busy,
      error: outcome?.kind === 'error' ? errorText(t, outcome.code) : null,
      outside: true,
    },
    [
      ...(added ? [] : fieldsOf(form, setForm, t)),
      outcome?.kind === 'notFound'
        ? el(
            'p',
            { key: 'nf', role: 'status', 'data-result': 'not-found' },
            t('chat.contactsEdit.notOnTelegram')
          )
        : null,
      added
        ? el('p', { key: 'ad', role: 'status', 'data-result': 'added' }, [
            t('chat.contactsEdit.added', { name: outcome.contact.name }),
            ' ',
            el(
              'button',
              {
                key: 'o',
                type: 'button',
                'data-action': 'open-contact-chat',
                onClick: () => {
                  openChat({ source: 'telegram', chat: outcome.chat });
                  close();
                },
              },
              t('chat.contactsEdit.openChat')
            ),
          ])
        : null,
    ]
  );
};
