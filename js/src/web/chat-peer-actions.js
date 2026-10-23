// Block, contacts and report in the info column, as Telegram Desktop
// offers them (R-Y128; learned, never copied): on a person, "Block user"
// / "Unblock user", "Add to contacts" (a dialog with the name and whether
// to share our phone number) / "Delete contact", and — for a stranger —
// "Report spam"; on any chat "Report", a dialog that walks Telegram's
// own list of reasons (asked of the server, each answer a narrower list
// or a request for words or the end). Every question is asked in the
// page, never by the browser; Telegram's errors show as text.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { useEsc } from './chat-invite.js';

const el = React.createElement;

// What the server last told of each person (blocked, in contacts), so a
// reopened column does not show the older state the chat's info holds.
const known = new Map();

// A call that may fail: `run(fn)` → the answer; `code` is set when it
// failed, `busy` while it is asked.
const useAsync = () => {
  const [state, setState] = useState({ busy: false, code: null });
  return {
    ...state,
    reset: () => setState({ busy: false, code: null }),
    run: async (fn) => {
      setState({ busy: true, code: null });
      const answer = await fn().catch(() => null);
      const code = answer?.ok ? null : (answer?.code ?? 'failed');
      setState({ busy: false, code });
      return answer;
    },
  };
};

const errorText = (t, code) => {
  const key = `chat.peer.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.peer.err.failed') : text;
};

const Shell = ({ name, title, error, children, buttons, onClose, t }) => {
  useEsc(onClose);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      'data-dialog': name,
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, title),
      ...React.Children.toArray(children),
      error ? el('p', { key: 'e', role: 'alert' }, errorText(t, error)) : null,
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            'data-action': 'cancel',
            onClick: onClose,
          },
          t('chat.invite.cancel')
        ),
        ...buttons,
      ]),
    ])
  );
};

const Confirm = ({ name, body, label, danger, busy, onYes, ...rest }) =>
  el(
    Shell,
    {
      name,
      ...rest,
      buttons: [
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: danger ? 'danger' : '',
            'data-action': `${name}-confirm`,
            disabled: busy,
            onClick: onYes,
          },
          label
        ),
      ],
    },
    el('p', { key: 'p' }, body)
  );

const AddDialog = ({ person, busy, error, onYes, onClose, t }) => {
  const [first, setFirst] = useState(person.first);
  const [last, setLast] = useState(person.last);
  const [share, setShare] = useState(false);
  const field = (key, value, set, label) =>
    el('label', { key, className: 'peer-field' }, [
      el('span', { key: 'l', className: 'meta' }, label),
      el('input', {
        key: 'i',
        type: 'text',
        value,
        maxLength: 64,
        'data-field': key,
        onChange: (e) => set(e.target.value),
      }),
    ]);
  return el(
    Shell,
    {
      name: 'contact-add',
      title: t('chat.peer.addTitle'),
      error,
      onClose,
      t,
      buttons: [
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            'data-action': 'contact-add-confirm',
            disabled: busy || !first.trim(),
            onClick: () => onYes({ firstName: first, lastName: last, share }),
          },
          t('chat.peer.addConfirm')
        ),
      ],
    },
    [
      field('first', first, setFirst, t('chat.peer.firstName')),
      field('last', last, setLast, t('chat.peer.lastName')),
      el('label', { key: 's', className: 'peer-share' }, [
        el('input', {
          key: 'c',
          type: 'checkbox',
          checked: share,
          'data-field': 'share',
          onChange: (e) => setShare(e.target.checked),
        }),
        ` ${t('chat.peer.share')}`,
      ]),
    ]
  );
};

// Telegram's list of reasons, asked until it ends in a report: each
// choice is sent back with its option; "comment" asks for words.
const ReportDialog = ({ api, chat, onClose, t }) => {
  const [step, setStep] = useState({ phase: 'loading' });
  const [words, setWords] = useState('');
  const send = useAsync();
  const ask = (body) =>
    send
      .run(() => api.telegramPeerReport({ chat: String(chat.chat), ...body }))
      .then((answer) => {
        if (answer?.ok) {
          setStep({ ...answer, phase: answer.result });
        }
      });
  React.useEffect(() => {
    ask({});
  }, []);
  const rows = (step.options ?? []).map((o) =>
    el(
      'button',
      {
        key: o.option,
        type: 'button',
        className: 'peer-reason',
        'data-action': 'report-reason',
        disabled: send.busy,
        onClick: () => ask({ option: o.option }),
      },
      o.text
    )
  );
  const comment = step.phase === 'comment';
  return el(
    Shell,
    {
      name: 'report',
      title: step.title || t('chat.peer.reportTitle'),
      error: send.code,
      onClose,
      t,
      buttons: comment
        ? [
            el(
              'button',
              {
                key: 'y',
                type: 'button',
                'data-action': 'report-send',
                disabled: send.busy || (!step.optional && !words.trim()),
                onClick: () => ask({ option: step.option, message: words }),
              },
              t('chat.peer.reportSend')
            ),
          ]
        : [],
    },
    [
      step.phase === 'loading'
        ? el('p', { key: 'w', className: 'meta' }, '…')
        : null,
      step.phase === 'reported'
        ? el('p', { key: 'd', 'data-report': 'done' }, t('chat.peer.reported'))
        : null,
      comment
        ? el('textarea', {
            key: 'c',
            className: 'peer-comment',
            value: words,
            maxLength: 512,
            placeholder: t('chat.peer.comment'),
            onChange: (e) => setWords(e.target.value),
          })
        : null,
      el('div', { key: 'r', className: 'peer-reasons' }, rows),
    ]
  );
};

const nameOf = (chat) => {
  const [first = '', ...rest] = String(chat?.name ?? '').split(' ');
  return { first, last: rest.join(' ') };
};

const useChanges = (api, chat, info) => {
  const key = String(chat.chat);
  const [state, setState] = useState(
    known.get(key) ?? {
      blocked: Boolean(info?.blocked),
      contact: Boolean(info?.contact),
    }
  );
  const [dialog, setDialog] = useState(null);
  const call = useAsync();
  const apply = (patch) => {
    known.set(key, { ...state, ...patch });
    setState((old) => ({ ...old, ...patch }));
    setDialog(null);
  };
  const run = (fn, patch) =>
    call.run(fn).then((answer) => answer?.ok && apply(patch));
  return {
    state,
    dialog,
    call,
    open: (name) => {
      call.reset();
      setDialog(name);
    },
    close: () => setDialog(null),
    block: (on) =>
      run(() => api.telegramPeerBlock({ chat: key, block: on }), {
        blocked: on,
      }),
    contact: (body, add) =>
      run(() => api.telegramPeerContact({ chat: key, add, ...body }), {
        contact: add,
      }),
    spam: () =>
      run(() => api.telegramPeerReportSpam({ chat: key }), {
        blocked: state.blocked,
      }),
  };
};

const Button = ({ action, label, onClick }) =>
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

const Dialogs = ({ api, chat, change, t }) => {
  const { dialog, call, close } = change;
  const shared = { busy: call.busy, error: call.code, onClose: close, t };
  const name = chat.name ?? '';
  switch (dialog) {
    case 'block':
      return el(Confirm, {
        ...shared,
        name: 'block',
        title: t('chat.peer.blockTitle'),
        body: t('chat.peer.blockBody', { name }),
        label: t('chat.peer.block'),
        danger: true,
        onYes: () => change.block(true),
      });
    case 'delete':
      return el(Confirm, {
        ...shared,
        name: 'contact-delete',
        title: t('chat.peer.deleteTitle'),
        body: t('chat.peer.deleteBody', { name }),
        label: t('chat.peer.delete'),
        danger: true,
        onYes: () => change.contact({}, false),
      });
    case 'spam':
      return el(Confirm, {
        ...shared,
        name: 'spam',
        title: t('chat.peer.spamTitle'),
        body: t('chat.peer.spamBody', { name }),
        label: t('chat.peer.spam'),
        danger: true,
        onYes: () => change.spam(),
      });
    case 'add':
      return el(AddDialog, {
        ...shared,
        person: nameOf(chat),
        onYes: (body) => change.contact(body, true),
      });
    case 'report':
      return el(ReportDialog, { api, chat, onClose: close, t });
    default:
      return null;
  }
};

/** The buttons, and the dialogs they open, for a Telegram chat's column. */
export const PeerActions = ({ api, chat, info }) => {
  const t = useT();
  const person = /^\d+$/.test(String(chat?.chat)) && info?.kind === 'user';
  const group = /^-\d+$/.test(String(chat?.chat)) && Boolean(info);
  const change = useChanges(api, chat, info);
  if (chat?.source !== 'telegram' || !(person || group)) {
    return null;
  }
  const { blocked, contact } = change.state;
  const buttons = person
    ? [
        contact
          ? ['contact-delete', 'deleteContact', 'delete']
          : ['contact-add', 'addContact', 'add'],
        blocked
          ? ['unblock', 'unblock', null]
          : ['block', 'blockUser', 'block'],
        ...(contact ? [] : [['report-spam', 'spam', 'spam']]),
      ]
    : [];
  return el('section', { className: 'person-section peer-actions' }, [
    ...buttons.map(([action, label, dialog]) =>
      el(Button, {
        key: action,
        action,
        label: t(`chat.peer.${label}`),
        onClick: () => (dialog ? change.open(dialog) : change.block(false)),
      })
    ),
    el(Button, {
      key: 'report',
      action: 'report',
      label: t('chat.peer.report'),
      onClick: () => change.open('report'),
    }),
    el(Dialogs, { key: 'd', api, chat, change, t }),
  ]);
};
