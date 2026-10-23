// Moderating members and handing a chat over, as Telegram Desktop's admin
// dialogs do (R-Y200; learned, never copied):
// - the delete dialog of a supergroup's admin offers "Report spam", "Ban
//   user" and "Delete all from <name>" when the messages are one member's
//   and the admin's rights allow each (`deleteModeration`);
// - a member's row offers the same two without messages (`ModerateDialog`),
// - the owner's edit dialog has "Transfer ownership" (`TransferOwnership`):
//   pick a member, give the 2-Step Verification password, which only lives
//   in the box while the dialog is open and is never shown again or kept;
// - the recent actions' deleted messages offer "Not spam" (`NotSpam`);
// - the owner of a supergroup may convert it to a broadcast group after a
//   warning (`ConvertGigagroup`).
// Telegram's refusals are told in words.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

const SUPERGROUP = /^-100\d+$/;
const USER = /^\d+$/;
const HOUR = 3600;

export const errorText = (t, code, vars) => {
  const key = `chat.mod.err.${code}`;
  const text = t(key, vars);
  return text === key ? t('chat.mod.err.failed') : text;
};

/** The answer's error as words; a wait Telegram asks for rides along. */
export const answerText = (t, answer) =>
  errorText(t, answer?.code ?? 'failed', {
    hours: Math.max(1, Math.ceil((answer?.waitSeconds ?? 0) / HOUR)),
  });

/**
 * What a supergroup admin may ask about a member, by the chat's info:
 * `reportSpam` and `deleteAll` need the right to delete messages, `ban`
 * the right to ban; `reportSpam` also needs messages to report.
 */
export const moderationOptions = (info, { withReport = false } = {}) => [
  ...(withReport && info?.canDeleteMessages ? ['reportSpam'] : []),
  ...(info?.canBan ? ['ban'] : []),
  ...(info?.canDeleteMessages ? ['deleteAll'] : []),
];

/**
 * For the delete dialog: `{ options, user, name }` when every message is
 * another member's, from the same person, in a supergroup the user
 * moderates; otherwise null.
 */
export const deleteModeration = (current, info, messages) => {
  if (
    current?.source !== 'telegram' ||
    !SUPERGROUP.test(String(current.chat)) ||
    info?.broadcast ||
    messages.length === 0
  ) {
    return null;
  }
  const first = messages[0];
  const user = String(first.sender ?? '');
  if (
    !USER.test(user) ||
    !messages.every((m) => String(m.sender ?? '') === user)
  ) {
    return null;
  }
  const options = moderationOptions(info, { withReport: true });
  return options.length === 0
    ? null
    : { options, user, name: first.senderName ?? user };
};

/** The checkboxes of the options, `picked` the ticked ones by key. */
export const ModerationBoxes = ({ options, name, picked, setPicked }) => {
  const t = useT();
  return el(
    'div',
    { className: 'moderation-boxes', 'data-moderation': '' },
    options.map((key) =>
      el('label', { key, className: 'pin-dialog-option' }, [
        el('input', {
          key: 'c',
          type: 'checkbox',
          'data-option': key,
          checked: Boolean(picked[key]),
          onChange: (e) => setPicked({ ...picked, [key]: e.target.checked }),
        }),
        el('span', { key: 'l' }, t(`chat.mod.${key}`, { name })),
      ])
    )
  );
};

/** What a member's menu asks: ban and/or delete all (supergroups). */
export const ModerateDialog = ({ api, chat, member, options, close, done }) => {
  const t = useT();
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const any = options.some((key) => picked[key]);
  const submit = async () => {
    if (!any) {
      return;
    }
    setBusy(true);
    const answer = await api
      .telegramModerateUser({
        chat,
        user: member.id,
        ...(picked.ban ? { ban: true } : {}),
        ...(picked.deleteAll ? { deleteAll: true } : {}),
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      done({ banned: Boolean(picked.ban) });
    } else {
      setError(answerText(t, answer));
    }
  };
  return el(
    FormDialog,
    {
      name: 'member-moderate',
      title: t('chat.mod.title', { name: member.name }),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.mod.apply'),
      busy: busy || !any,
      error,
    },
    el(ModerationBoxes, {
      key: 'b',
      options,
      name: member.name,
      picked,
      setPicked,
    })
  );
};

// The members to hand the chat to: admins first, not oneself, found by
// words as in the members list (R-Y125).
const useCandidates = (api, chat, q) => {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    const timer = globalThis.setTimeout(
      () =>
        api
          .telegramMembers({ chat, q, offset: 0, limit: 50 })
          .then((a) => {
            const ok = (a?.members ?? []).filter(
              (m) => !m.self && m.role !== 'creator'
            );
            if (live) {
              setList([
                ...ok.filter((m) => m.role === 'admin'),
                ...ok.filter((m) => m.role !== 'admin'),
              ]);
            }
          })
          .catch(() => {}),
      q ? 300 : 0
    );
    return () => {
      live = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, chat, q]);
  return list;
};

const Picker = ({ list, q, setQ, user, setUser, t }) => [
  el('input', {
    key: 'q',
    type: 'search',
    className: 'member-search',
    value: q,
    maxLength: 64,
    placeholder: t('chat.members.search'),
    'aria-label': t('chat.members.search'),
    onChange: (e) => setQ(e.target.value),
  }),
  el(
    'ul',
    { key: 'l', className: 'member-list transfer-list' },
    list.map((m) =>
      el('li', { key: m.id, className: 'member-row' }, [
        el('label', { key: 'l', className: 'pin-dialog-option' }, [
          el('input', {
            key: 'r',
            type: 'radio',
            name: 'transfer-to',
            'data-transfer-to': m.id,
            checked: user?.id === m.id,
            onChange: () => setUser(m),
          }),
          el('span', { key: 'n' }, m.name),
          m.role === 'admin'
            ? el(
                'span',
                { key: 'b', className: 'person-badge member-badge' },
                t('chat.members.admin')
              )
            : null,
        ]),
      ])
    )
  ),
];

/** The owner's "Transfer ownership": pick a member, the 2-Step password. */
export const TransferDialog = ({ api, chat, close, done }) => {
  const t = useT();
  const [q, setQ] = useState('');
  const [user, setUser] = useState(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const list = useCandidates(api, chat, q.trim());
  const submit = async () => {
    if (!user || password === '') {
      return;
    }
    setBusy(true);
    const answer = await api
      .telegramTransferOwnership({ chat, user: user.id, password })
      .catch(() => null);
    // Never kept, whatever the answer.
    setPassword('');
    setBusy(false);
    if (answer?.ok) {
      done();
    } else {
      setError(answerText(t, answer));
    }
  };
  return el(
    FormDialog,
    {
      name: 'transfer-ownership',
      title: t('chat.mod.transferTitle'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.mod.transferGo'),
      busy: busy || !user || password === '',
      error,
    },
    [
      el('p', { key: 'w' }, t('chat.mod.transferBody')),
      ...Picker({ list, q, setQ, user, setUser, t }),
      el('label', { key: 'p', className: 'chat-form-field' }, [
        el('span', { key: 'l', className: 'meta' }, t('chat.mod.password')),
        el('input', {
          key: 'i',
          type: 'password',
          name: 'transfer-password',
          'data-field': 'password',
          autoComplete: 'off',
          maxLength: 256,
          value: password,
          onChange: (e) => setPassword(e.target.value),
        }),
      ]),
    ]
  );
};

/** Whether the edit dialog offers the transfer: the chat's owner. */
export const canTransfer = (chat, info, api) =>
  /^-\d+$/.test(String(chat?.chat)) &&
  Boolean(info?.owner) &&
  typeof api?.telegramTransferOwnership === 'function' &&
  typeof api?.telegramMembers === 'function';

/** "Transfer ownership" in the edit dialog, its own dialog in a portal. */
export const TransferOwnership = ({ api, chat }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState(false);
  if (moved) {
    return el(
      'p',
      { className: 'meta', 'data-transfer': 'done' },
      t('chat.mod.transferDone')
    );
  }
  return el('div', { className: 'chat-form-field giga-row' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'transfer-ownership',
        onClick: () => setOpen(true),
      },
      t('chat.mod.transferButton')
    ),
    open
      ? createPortal(
          // React lets a portal's submit bubble to the edit form: stopped.
          el(
            'div',
            { onSubmit: (e) => e.stopPropagation() },
            el(TransferDialog, {
              api,
              chat: String(chat.chat),
              close: () => setOpen(false),
              done: () => {
                setOpen(false);
                setMoved(true);
              },
            })
          ),
          document.body
        )
      : null,
  ]);
};

/** "Not spam" beside a message anti-spam deleted, in Recent actions. */
export const NotSpam = ({ api, chat, msgId }) => {
  const t = useT();
  const [state, setState] = useState({ phase: 'idle' });
  if (typeof api?.telegramNotSpam !== 'function') {
    return null;
  }
  if (state.phase === 'done') {
    return el(
      'span',
      { className: 'meta', 'data-not-spam': 'done' },
      t('chat.mod.notSpamDone')
    );
  }
  const send = async () => {
    setState({ phase: 'busy' });
    const answer = await api
      .telegramNotSpam({ chat, msgId: String(msgId) })
      .catch(() => null);
    setState(
      answer?.ok
        ? { phase: 'done' }
        : { phase: 'idle', error: answerText(t, answer) }
    );
  };
  return el('span', { className: 'not-spam' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'not-spam',
        disabled: state.phase === 'busy',
        onClick: send,
      },
      t('chat.mod.notSpam')
    ),
    state.error
      ? el(
          'span',
          { key: 'e', className: 'comments-failed', role: 'alert' },
          state.error
        )
      : null,
  ]);
};

// The warning before a supergroup becomes a broadcast group.
const GigaWarning = ({ onYes, onNo, busy, error }) => {
  const t = useT();
  useEsc(onNo);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('chat.mod.gigaTitle'),
      'data-dialog': 'convert-gigagroup',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.mod.gigaTitle')),
      el('p', { key: 'p' }, t('chat.mod.gigaBody')),
      error ? el('p', { key: 'e', role: 'alert' }, error) : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          { key: 'n', type: 'button', 'data-action': 'cancel', onClick: onNo },
          t('common.cancel')
        ),
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'giga-confirm',
            disabled: busy,
            onClick: onYes,
          },
          t('chat.mod.gigaGo')
        ),
      ]),
    ])
  );
};

/** Whether the edit dialog offers the conversion: a supergroup's owner. */
export const canConvert = (chat, info, api) =>
  SUPERGROUP.test(String(chat?.chat)) &&
  Boolean(info?.canConvertGiga) &&
  typeof api?.telegramConvertGigagroup === 'function';

/** "Convert to broadcast group" for the owner, after a warning. */
export const ConvertGigagroup = ({ api, chat }) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [converted, setConverted] = useState(false);
  const go = async () => {
    setBusy(true);
    const answer = await api
      .telegramConvertGigagroup({ chat: String(chat.chat), confirm: true })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      setAsking(false);
      setConverted(true);
    } else {
      setError(answerText(t, answer));
    }
  };
  if (converted) {
    return el(
      'p',
      { className: 'meta', 'data-giga': 'done' },
      t('chat.mod.gigaDone')
    );
  }
  return el('div', { className: 'chat-form-field giga-row' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'convert-gigagroup',
        onClick: () => setAsking(true),
      },
      t('chat.mod.gigaButton')
    ),
    el('span', { key: 'h', className: 'meta' }, t('chat.mod.gigaHint')),
    // Outside the edit form: its own buttons must not submit it.
    asking
      ? createPortal(
          el(GigaWarning, {
            busy,
            error,
            onYes: go,
            onNo: () => setAsking(false),
          }),
          document.body
        )
      : null,
  ]);
};
