// The Contacts window, as Telegram Desktop's main menu has it (R-Y189;
// learned, never copied): the user's contacts with avatar, name and a
// status line ("online", "last seen …"), sorted by last seen (online
// first) or by name, a search over name, username and phone, a click that
// opens the contact's chat, and "Add contact". The statuses are asked
// again while the window is open, at most once a minute. Nothing is
// written here except by Add contact.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { Frame } from './chat-readers.js';
import { infoLine } from './chat-info.js';
import { PeerAvatar } from './peer-avatar.js';
import { openChat } from './chat-state.js';
import { ShareContactDialog } from './chat-contact-share.js';

const el = React.createElement;

/** The statuses are asked again no oftener than this (ms). */
export const REFRESH_MS = 60_000;

const DAY_MS = 86_400_000;
// How long ago "recently", "within a week" and "within a month" mean, for
// sorting only (Telegram does not say more).
const AGE_MS = { recently: DAY_MS, week: 5 * DAY_MS, month: 20 * DAY_MS };

/** When the contact was last seen, in ms (`now` for online), or -Infinity. */
export const seenAt = (contact, now) => {
  if (contact.online) {
    return now;
  }
  if (AGE_MS[contact.lastSeen]) {
    return now - AGE_MS[contact.lastSeen];
  }
  const when = Date.parse(contact.lastSeen ?? '');
  return Number.isNaN(when) ? -Infinity : when;
};

const byName = (a, b) => a.name.localeCompare(b.name);

/**
 * `contacts` sorted: `seen` puts the online ones first, then the most
 * recently seen, ties by name; `name` sorts by name. A new array.
 */
export const sortContacts = (contacts, mode, now = Date.now()) => {
  if (mode === 'name') {
    return [...contacts].sort(byName);
  }
  return [...contacts].sort((a, b) => {
    if (Boolean(a.online) !== Boolean(b.online)) {
      return a.online ? -1 : 1;
    }
    const diff = seenAt(b, now) - seenAt(a, now);
    return diff === 0 || Number.isNaN(diff) ? byName(a, b) : diff;
  });
};

const digits = (text) => String(text ?? '').replace(/\D/g, '');

/** The contacts whose name, username or phone holds `query`. */
export const filterContacts = (contacts, query) => {
  const q = String(query ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  if (!q) {
    return contacts;
  }
  const number = digits(q);
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.username ?? '').toLowerCase().includes(q) ||
      (number !== '' && digits(c.phone).includes(number))
  );
};

/** `contacts` with the fresh `statuses` ([{ id, online, lastSeen? }]) applied. */
export const mergeStatuses = (contacts, statuses) => {
  const byId = new Map((statuses ?? []).map((s) => [s.id, s]));
  return contacts.map((c) => {
    const s = byId.get(c.id);
    return s
      ? { ...c, online: Boolean(s.online), lastSeen: s.lastSeen ?? undefined }
      : c;
  });
};

/** The status line of `contact`: "online", "last seen …". */
export const statusLine = (t, contact, chatTime) =>
  infoLine(
    t,
    { kind: 'user', online: contact.online, lastSeen: contact.lastSeen },
    { kind: 'private', chatTime }
  );

// The contacts, asked on open and again when `reload` changes; the
// statuses every REFRESH_MS while the window is open.
const useContactList = (api, reload) => {
  const [state, setState] = useState({ phase: 'loading', contacts: [] });
  useEffect(() => {
    let live = true;
    api
      .telegramChatContacts()
      .then(
        (a) =>
          live &&
          setState(
            a?.ok
              ? { phase: 'ready', contacts: a.contacts ?? [] }
              : { phase: 'error', contacts: [] }
          )
      )
      .catch(() => live && setState({ phase: 'error', contacts: [] }));
    const timer = globalThis.setInterval(() => {
      Promise.resolve(api.telegramContactStatuses?.())
        .then(
          (a) =>
            live &&
            a?.ok &&
            setState((was) => ({
              ...was,
              contacts: mergeStatuses(was.contacts, a.statuses),
            }))
        )
        .catch(() => {});
    }, REFRESH_MS);
    return () => {
      live = false;
      globalThis.clearInterval(timer);
    };
  }, [api, reload]);
  return state;
};

const ContactRow = ({ api, contact, line, onOpen }) =>
  el(
    'li',
    { className: 'contact-row', 'data-contact': contact.id },
    el(
      'button',
      {
        type: 'button',
        className: 'member-open',
        'data-action': 'open-contact',
        onClick: () => onOpen(contact),
      },
      [
        el(PeerAvatar, {
          key: 'a',
          api,
          source: 'telegram',
          peer: contact.id,
          name: contact.name,
          size: 's',
        }),
        el('span', { key: 'n', className: 'contact-text' }, [
          el('span', { key: 'n', className: 'member-name' }, contact.name),
          el(
            'span',
            {
              key: 's',
              className: contact.online
                ? 'meta contact-status is-online'
                : 'meta contact-status',
              'data-status': contact.online ? 'online' : 'offline',
            },
            line
          ),
        ]),
      ]
    )
  );

const Controls = ({ t, query, setQuery, mode, setMode, onAdd, onShare }) =>
  el('div', { className: 'contacts-controls' }, [
    el('input', {
      key: 'q',
      type: 'search',
      className: 'chat-search',
      'data-field': 'contacts-search',
      placeholder: t('chat.contacts.search'),
      'aria-label': t('chat.contacts.search'),
      value: query,
      onChange: (e) => setQuery(e.target.value),
    }),
    el(
      'button',
      {
        key: 's',
        type: 'button',
        className: 'contacts-sort',
        'data-action': 'contacts-sort',
        'data-mode': mode,
        onClick: () => setMode(mode === 'seen' ? 'name' : 'seen'),
      },
      t('chat.contacts.sortBy', {
        by: t(
          mode === 'seen' ? 'chat.contacts.bySeen' : 'chat.contacts.byName'
        ),
      })
    ),
    onAdd
      ? el(
          'button',
          {
            key: 'a',
            type: 'button',
            className: 'contacts-add',
            'data-action': 'contacts-add',
            onClick: onAdd,
          },
          t('chat.contactsEdit.addContact')
        )
      : null,
    // Share my contact: a link and a QR code (R-Y217).
    onShare
      ? el(
          'button',
          {
            key: 'sh',
            type: 'button',
            className: 'contacts-add',
            'data-action': 'contacts-share',
            onClick: onShare,
          },
          t('chat.contactShare.open')
        )
      : null,
  ]);

const Empty = ({ t, state, shown }) => {
  if (state.phase === 'loading') {
    return el('p', { className: 'meta' }, t('chat.contacts.loading'));
  }
  if (state.phase === 'error') {
    return el(
      'p',
      { className: 'comments-failed', role: 'alert' },
      t('chat.contacts.failed')
    );
  }
  return shown.length === 0
    ? el('p', { className: 'meta' }, t('chat.contacts.none'))
    : null;
};

/**
 * The window: `AddContact` is the Add contact dialog (while it shows, the
 * window waits behind it and asks the list again once it is closed).
 */
export const ContactsDialog = ({ api, close, AddContact = null }) => {
  const t = useT();
  const { chatTime } = useDates();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('seen');
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reload, setReload] = useState(0);
  const state = useContactList(api, reload);
  const shown = useMemo(
    () => sortContacts(filterContacts(state.contacts, query), mode),
    [state.contacts, query, mode]
  );
  const open = useCallback(
    (contact) => {
      openChat({ source: 'telegram', chat: contact.id });
      close();
    },
    [close]
  );
  const canAdd =
    AddContact !== null && typeof api.telegramContactImport === 'function';
  if (adding && canAdd) {
    return el(AddContact, {
      api,
      close: () => {
        setAdding(false);
        setReload((n) => n + 1);
      },
    });
  }
  if (sharing) {
    return el(ShareContactDialog, { api, close: () => setSharing(false) });
  }
  return el(
    Frame,
    { title: t('chat.contacts.title'), close, name: 'contacts' },
    [
      el(Controls, {
        key: 'c',
        t,
        query,
        setQuery,
        mode,
        setMode,
        onAdd: canAdd ? () => setAdding(true) : null,
        onShare:
          typeof api.telegramContactToken === 'function'
            ? () => setSharing(true)
            : null,
      }),
      el(Empty, { key: 'e', t, state, shown }),
      el(
        'ul',
        { key: 'l', className: 'member-list contacts-list' },
        shown.map((contact) =>
          el(ContactRow, {
            key: contact.id,
            api,
            contact,
            line: statusLine(t, contact, chatTime),
            onOpen: open,
          })
        )
      ),
    ]
  );
};

/** The list's menu entry and the window it opens. */
export const useContactsWindow = ({ api, AddContact }) => {
  const [shown, setShown] = useState(false);
  const close = useCallback(() => setShown(false), []);
  return {
    open: () => setShown(true),
    dialog: shown
      ? el(ContactsDialog, { key: 'contacts', api, close, AddContact })
      : null,
  };
};
