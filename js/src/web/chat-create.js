// New group and new channel from the chat list, as Telegram Desktop has
// them (R-Y129; learned, never copied): a "+" beside the list's title
// offers New Group and New Channel. A group is made in two steps in the
// page — pick people from the contacts (a search box, a check for each),
// then name it; a channel takes a name and a description. Telegram makes
// it, the new chat opens. Its refusals show as text.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { openChat } from './chat-state.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

export const errorText = (t, code) => {
  const key = `chat.create.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.create.err.failed') : text;
};

/** The dialog frame: a title, the body, a Cancel and the main button. */
export const FormDialog = ({
  name,
  title,
  onClose,
  onSubmit,
  submit,
  busy,
  error,
  outside = false,
  children,
}) => {
  const t = useT();
  useEsc(onClose);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      'data-dialog': name,
      // A click on the dim area outside the card closes it.
      onClick: outside
        ? (event) => event.target === event.currentTarget && onClose()
        : undefined,
    },
    el(
      'form',
      {
        className: 'delete-dialog chat-form-dialog',
        onSubmit: (event) => {
          event.preventDefault();
          onSubmit();
        },
      },
      [
        el('h3', { key: 'h' }, title),
        ...React.Children.toArray(children),
        error
          ? el(
              'p',
              { key: 'e', className: 'chat-form-error', role: 'alert' },
              error
            )
          : null,
        el('div', { key: 'b', className: 'delete-dialog-btns' }, [
          el(
            'button',
            {
              key: 'c',
              type: 'button',
              'data-action': 'cancel',
              onClick: onClose,
            },
            t('chat.create.cancel')
          ),
          el(
            'button',
            {
              key: 's',
              type: 'submit',
              className: 'primary',
              'data-action': 'submit',
              disabled: busy,
            },
            submit
          ),
        ]),
      ]
    )
  );
};

/** A labelled text box (or text area) for the dialogs. */
export const Field = ({ label, name, area = false, ...props }) =>
  el('label', { className: 'chat-form-field' }, [
    el('span', { key: 'l', className: 'meta' }, label),
    el(area ? 'textarea' : 'input', {
      key: 'i',
      name,
      type: area ? undefined : 'text',
      rows: area ? 3 : undefined,
      'data-field': name,
      ...props,
    }),
  ]);

/** The name box (128 letters at most) and the description (255). */
export const Title = ({ label, value, set }) =>
  el(Field, {
    label,
    name: 'title',
    value,
    maxLength: 128,
    autoFocus: true,
    onChange: (event) => set(event.target.value),
  });
export const About = ({ label, value, set }) =>
  el(Field, {
    label,
    name: 'about',
    area: true,
    value,
    maxLength: 255,
    onChange: (event) => set(event.target.value),
  });

// The user's contacts, asked once.
export const useContacts = (api) => {
  const [state, setState] = useState({ phase: 'loading', contacts: [] });
  useEffect(() => {
    let active = true;
    api
      .telegramChatContacts()
      .then((answer) => {
        if (active) {
          setState(
            answer?.ok
              ? { phase: 'ready', contacts: answer.contacts ?? [] }
              : { phase: 'error', contacts: [] }
          );
        }
      })
      .catch(() => active && setState({ phase: 'error', contacts: [] }));
    return () => {
      active = false;
    };
  }, [api]);
  return state;
};

const matches = (contact, q) =>
  !q ||
  contact.name.toLowerCase().includes(q) ||
  (contact.username ?? '').toLowerCase().includes(q);

// `field` names the data attribute of each check (R-Y164 picks chats too).
export const Picker = ({
  contacts,
  picked,
  toggle,
  t,
  placeholder,
  field = 'contact',
}) => {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  return el('div', { className: 'chat-pick' }, [
    el('input', {
      key: 'q',
      type: 'search',
      className: 'chat-search',
      'data-field': 'search',
      placeholder: placeholder ?? t('chat.create.searchContacts'),
      'aria-label': placeholder ?? t('chat.create.searchContacts'),
      value: q,
      onChange: (event) => setQ(event.target.value),
    }),
    el(
      'ul',
      { key: 'l', className: 'chat-pick-list' },
      contacts
        .filter((c) => matches(c, words))
        .map((c) =>
          el(
            'li',
            { key: c.id },
            el('label', { className: 'chat-pick-row' }, [
              el('input', {
                key: 'c',
                type: 'checkbox',
                [`data-${field}`]: c.id,
                checked: picked.has(c.id),
                onChange: () => toggle(c.id),
              }),
              el('span', { key: 'n' }, c.name),
              c.username
                ? el('span', { key: 'u', className: 'meta' }, `@${c.username}`)
                : null,
            ])
          )
        )
    ),
  ]);
};

// Opens the new chat once Telegram made it, else shows why not.
const useCreate = (t, close) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (ask) => {
    setBusy(true);
    const answer = await ask().catch(() => null);
    setBusy(false);
    if (answer?.ok && answer.chat) {
      openChat({ source: 'telegram', chat: answer.chat });
      close();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return { busy, error, setError, run };
};

const GroupDialog = ({ api, close }) => {
  const t = useT();
  const contacts = useContacts(api);
  const [picked, setPicked] = useState(new Set());
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState('');
  const { busy, error, setError, run } = useCreate(t, close);
  const toggle = (id) =>
    setPicked((old) => {
      const next = new Set(old);
      return next.delete(id) ? next : next.add(id);
    });
  const next = () => {
    if (picked.size === 0) {
      setError(errorText(t, 'users-too-few'));
    } else {
      setError(null);
      setStep(2);
    }
  };
  const first = step === 1;
  let body;
  if (!first) {
    body = el(Title, {
      label: t('chat.create.groupName'),
      value: title,
      set: setTitle,
    });
  } else if (contacts.phase === 'ready') {
    body = el(Picker, { contacts: contacts.contacts, picked, toggle, t });
  } else {
    body = el(
      'p',
      { className: 'meta' },
      t(
        contacts.phase === 'loading'
          ? 'chat.create.loadingContacts'
          : 'chat.create.err.failed'
      )
    );
  }
  return el(
    FormDialog,
    {
      name: 'new-group',
      title: t('chat.create.newGroup'),
      onClose: close,
      onSubmit: first
        ? next
        : () =>
            run(() => api.telegramGroupCreate({ title, users: [...picked] })),
      submit: first ? t('chat.create.next') : t('chat.create.create'),
      busy,
      error,
    },
    body
  );
};

const ChannelDialog = ({ api, close }) => {
  const t = useT();
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const { busy, error, run } = useCreate(t, close);
  return el(
    FormDialog,
    {
      name: 'new-channel',
      title: t('chat.create.newChannel'),
      onClose: close,
      onSubmit: () => run(() => api.telegramChannelCreate({ title, about })),
      submit: t('chat.create.create'),
      busy,
      error,
    },
    [
      el(Title, {
        key: 't',
        label: t('chat.create.channelName'),
        value: title,
        set: setTitle,
      }),
      el(About, {
        key: 'a',
        label: t('chat.create.description'),
        value: about,
        set: setAbout,
      }),
    ]
  );
};

/** The list's "+": New Group and New Channel, each in a dialog. */
export const NewChat = ({ api }) => {
  const t = useT();
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(null);
  if (typeof api?.telegramGroupCreate !== 'function') {
    return null;
  }
  const choose = (kind) => {
    setMenu(false);
    setDialog(kind);
  };
  return el('span', { className: 'new-chat' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'icon-btn new-chat-btn',
        'data-action': 'new-chat',
        'aria-label': t('chat.create.new'),
        title: t('chat.create.new'),
        'aria-expanded': menu,
        onClick: () => setMenu(!menu),
      },
      '+'
    ),
    menu
      ? el('div', { key: 'm', className: 'new-chat-menu', role: 'menu' }, [
          el(
            'button',
            {
              key: 'g',
              type: 'button',
              role: 'menuitem',
              'data-action': 'new-group',
              onClick: () => choose('group'),
            },
            t('chat.create.newGroup')
          ),
          el(
            'button',
            {
              key: 'c',
              type: 'button',
              role: 'menuitem',
              'data-action': 'new-channel',
              onClick: () => choose('channel'),
            },
            t('chat.create.newChannel')
          ),
        ])
      : null,
    dialog === 'group'
      ? el(GroupDialog, { key: 'dg', api, close: () => setDialog(null) })
      : null,
    dialog === 'channel'
      ? el(ChannelDialog, { key: 'dc', api, close: () => setDialog(null) })
      : null,
  ]);
};
