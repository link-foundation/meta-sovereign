// "Add members" in the info column, as Telegram Desktop has it (R-Y204;
// learned, never copied): for a group or channel the user may invite to
// (its creator, or an admin with the right to invite), a button opens a
// picker of contacts and the people written to most, with a search box and
// a check for each. "Add" asks Telegram; the people whose privacy keeps
// them from being added are listed in a second dialog that offers to send
// them the chat's invite link — sent only when the user presses that
// button. Telegram's refusals are told in words.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog, Picker } from './chat-create.js';

const el = React.createElement;

const EVENT = 'ms-members-changed';

/** Tells the members list (and others) that people were added. */
export const announceMembersChanged = () =>
  globalThis.dispatchEvent?.(new CustomEvent(EVENT));

/** A counter that grows each time people were added (to read again). */
export const useMembersChanged = () => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const on = () => setCount((n) => n + 1);
    globalThis.addEventListener?.(EVENT, on);
    return () => globalThis.removeEventListener?.(EVENT, on);
  }, []);
  return count;
};

/** Whether the info column offers Add members: the user may invite. */
export const canAddMembers = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  Boolean(info) &&
  info.kind !== 'user' &&
  Boolean(info.canInvite);

/** The words for a code of the admin and member answers. */
export const adminErrorText = (t, code) => {
  const key = `chat.admins.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.admins.err.failed') : text;
};

// The people to pick from, asked once.
const usePeople = (api, chat) => {
  const [state, setState] = useState({ phase: 'loading', people: [] });
  useEffect(() => {
    let active = true;
    api
      .telegramAddCandidates({ chat })
      .catch(() => null)
      .then((answer) => {
        if (active) {
          setState(
            answer?.ok
              ? { phase: 'ready', people: answer.people ?? [] }
              : { phase: 'error', code: answer?.code ?? 'failed', people: [] }
          );
        }
      });
    return () => {
      active = false;
    };
  }, [api, chat]);
  return state;
};

// The dialog offering the invite link to those who could not be added.
const MissingDialog = ({ api, chat, missing, close }) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const send = async () => {
    setBusy(true);
    const answer = await api
      .telegramMembersInviteLink({ chat, users: missing.map((m) => m.id) })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setSent(true);
    } else {
      setError(adminErrorText(t, answer?.code ?? 'failed'));
    }
  };
  return el(
    FormDialog,
    {
      name: 'invite-offer',
      title: t('chat.admins.missingTitle'),
      onClose: close,
      onSubmit: sent ? close : send,
      submit: sent ? t('chat.admins.done') : t('chat.admins.sendLink'),
      busy,
      error,
    },
    el(
      'p',
      { className: 'meta', 'data-invite-note': '' },
      sent
        ? t('chat.admins.linkSent')
        : t('chat.admins.missingBody', {
            names: missing.map((m) => m.name).join(', '),
          })
    )
  );
};

const AddDialog = ({ api, chat, close }) => {
  const t = useT();
  const people = usePeople(api, chat);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(null);
  const toggle = (id) =>
    setPicked((old) => {
      const next = new Set(old);
      return next.delete(id) ? next : next.add(id);
    });
  const add = async () => {
    if (picked.size === 0) {
      setError(adminErrorText(t, 'none-picked'));
      return;
    }
    setBusy(true);
    const answer = await api
      .telegramMembersAdd({ chat, users: [...picked] })
      .catch(() => null);
    setBusy(false);
    if (!answer?.ok) {
      setError(adminErrorText(t, answer?.code ?? 'failed'));
      return;
    }
    announceMembersChanged();
    if (answer.missing?.length) {
      setMissing(answer.missing);
    } else if (answer.failed?.length) {
      setError(adminErrorText(t, answer.failed[0].code));
    } else {
      close();
    }
  };
  if (missing) {
    return el(MissingDialog, { api, chat, missing, close });
  }
  let body;
  if (people.phase === 'ready') {
    body = el(Picker, {
      contacts: people.people,
      picked,
      toggle,
      t,
      placeholder: t('chat.admins.addSearch'),
    });
  } else {
    body = el(
      'p',
      { className: 'meta' },
      people.phase === 'loading'
        ? t('chat.create.loadingContacts')
        : adminErrorText(t, people.code)
    );
  }
  return el(
    FormDialog,
    {
      name: 'add-members',
      title: t('chat.admins.addTitle'),
      onClose: close,
      onSubmit: add,
      submit: t('chat.admins.addSubmit'),
      busy,
      error,
    },
    body
  );
};

/** "Add members" for those who may invite; the dialogs it opens. */
export const AddMembers = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (
    !canAddMembers(chat, info) ||
    typeof api?.telegramMembersAdd !== 'function'
  ) {
    return null;
  }
  return el('div', { className: 'chat-edit-bar' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'add-members',
        onClick: () => setOpen(true),
      },
      t('chat.admins.addMembers')
    ),
    open
      ? el(AddDialog, {
          key: 'd',
          api,
          chat: String(chat.chat),
          close: () => setOpen(false),
        })
      : null,
  ]);
};
