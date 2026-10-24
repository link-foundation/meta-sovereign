// A channel's or supergroup's public link, as Telegram Desktop's "Channel
// type" / "Group type" has it (R-Y216; learned, never copied): Public or
// Private, and for Public the link t.me/<name>, checked as it is typed (once
// typing pauses) and saved with the button; Private is an empty name. When
// Telegram says the user has too many public channels, those channels are
// listed with "Revoke link" each. "Deactivate all usernames" shows where
// collectible usernames exist. The owner alone gets the row.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog, Field } from './chat-create.js';

const el = React.createElement;

const NAME = /^[A-Za-z][A-Za-z0-9_]{3,30}[A-Za-z0-9]$/;
const PAUSE_MS = 400;

export const errorText = (t, code) => {
  const key = `chat.manage.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.manage.err.failed') : text;
};

/** The name a typed link or @name carries (t.me/ and @ dropped). */
export const nameOfInput = (input) =>
  String(input ?? '')
    .trim()
    .replace(/^(?:https?:\/\/)?(?:t|telegram)\.me\//i, '')
    .replace(/^@/, '');

/** Whether the owner's row is offered for this chat. */
export const canSetType = (chat, info, api) =>
  /^-100\d+$/.test(String(chat?.chat)) &&
  Boolean(info?.owner) &&
  typeof api?.telegramChannelUsernameSave === 'function';

// What was saved this session, by chat key: the public name ('' private).
const saved = new Map();

/** The chat's public name now: saved here or from its info. */
export const publicNameOf = (key, info) =>
  saved.has(key) ? saved.get(key) : (info?.username ?? '');

// Asks whether `name` is free once typing pauses: { state, code }.
const useCheck = (api, chat, name, current, again) => {
  const [seen, setSeen] = useState({ name: '', state: 'idle', code: null });
  useEffect(() => {
    if (!NAME.test(name) || name === current) {
      return undefined;
    }
    let live = true;
    const timer = globalThis.setTimeout(() => {
      Promise.resolve(
        api.telegramChannelUsernameCheck({ chat: String(chat), username: name })
      )
        .catch(() => null)
        .then(
          (answer) =>
            live &&
            setSeen({
              name,
              state: answer?.ok ? 'available' : 'error',
              code: answer?.code ?? 'failed',
            })
        );
    }, PAUSE_MS);
    return () => {
      live = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, chat, name, current, again]);
  if (!name || name === current) {
    return { state: 'idle', code: null };
  }
  if (!NAME.test(name)) {
    return { state: 'error', code: 'invalid' };
  }
  return seen.name === name ? seen : { state: 'checking', code: null };
};

const Status = ({ t, name, check }) => {
  if (check.state === 'idle') {
    return null;
  }
  let text = t('chat.manage.checking');
  if (check.state === 'available') {
    text = t('chat.manage.available', { name });
  } else if (check.state === 'error') {
    text = errorText(t, check.code);
  }
  return el(
    'p',
    {
      className: `meta public-link-status is-${check.state}`,
      'data-link-status': check.state === 'error' ? check.code : check.state,
      role: 'status',
    },
    text
  );
};

// The user's public channels, each with "Revoke link", when the limit hit.
const Crowded = ({ api, t, onRevoked }) => {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(api.telegramPublicChannels())
      .catch(() => null)
      .then((answer) => live && setList(answer?.ok ? answer.channels : []));
    return () => {
      live = false;
    };
  }, [api]);
  const revoke = async (chat) => {
    const answer = await api
      .telegramPublicLinkRevoke({ chat })
      .catch(() => null);
    if (answer?.ok) {
      setList((now) => now.filter((x) => x.chat !== chat));
      setError(null);
      onRevoked();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return el('div', { className: 'public-link-crowded', 'data-crowded': '' }, [
    el('p', { key: 'h' }, t('chat.manage.crowded')),
    ...(list ?? []).map((c) =>
      el('div', { key: c.chat, className: 'public-link-channel' }, [
        el('span', { key: 't' }, `${c.title} (t.me/${c.username})`),
        el(
          'button',
          {
            key: 'r',
            type: 'button',
            className: 'danger',
            'data-action': 'revoke-link',
            'data-chat': c.chat,
            onClick: () => revoke(c.chat),
          },
          t('chat.manage.revoke')
        ),
      ])
    ),
    error ? el('p', { key: 'e', role: 'alert' }, error) : null,
  ]);
};

const Choice = ({ t, kind, value, set }) =>
  el(
    'button',
    {
      type: 'button',
      className: value === kind ? 'chosen' : '',
      'aria-pressed': value === kind,
      'data-link-kind': kind,
      onClick: () => set(kind),
    },
    t(`chat.manage.${kind}`)
  );

// "Deactivate all usernames", asked again before it is done.
const Deactivate = ({ api, chat, t, done }) => {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);
  const yes = async () => {
    const answer = await api
      .telegramUsernamesDeactivate({ chat: String(chat) })
      .catch(() => null);
    if (answer?.ok) {
      done();
    } else {
      setError(errorText(t, answer?.code ?? 'failed'));
    }
  };
  return asking
    ? el('div', { className: 'public-link-deactivate' }, [
        el('p', { key: 'p' }, t('chat.manage.deactivateBody')),
        error ? el('p', { key: 'e', role: 'alert' }, error) : null,
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'deactivate-confirm',
            onClick: yes,
          },
          t('chat.manage.deactivateConfirm')
        ),
      ])
    : el(
        'button',
        {
          type: 'button',
          'data-action': 'deactivate-usernames',
          onClick: () => setAsking(true),
        },
        t('chat.manage.deactivate')
      );
};

// The form's state: the kind, the typed link, its check and Save.
const useLinkForm = (api, chat, info, close) => {
  const current = publicNameOf(chat.key, info);
  const [kind, setKind] = useState(current ? 'public' : 'private');
  const [input, setInput] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [again, setAgain] = useState(0);
  const name = nameOfInput(input);
  const target = kind === 'public' ? name : '';
  const check = useCheck(api, chat.chat, target, current, again);
  const ready =
    target !== current && (kind === 'private' || check.state === 'available');
  const save = async () => {
    if (!ready) {
      return;
    }
    setBusy(true);
    const answer = await api
      .telegramChannelUsernameSave({
        chat: String(chat.chat),
        username: target,
      })
      .catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      saved.set(chat.key, target);
      close();
    } else {
      setError(answer?.code ?? 'failed');
    }
  };
  const retype = (value) => {
    setInput(value);
    setError(null);
  };
  const revoked = () => {
    setError(null);
    setAgain((n) => n + 1);
  };
  const crowded =
    (check.state === 'error' && check.code === 'too-many-public') ||
    error === 'too-many-public';
  return {
    kind,
    setKind,
    input,
    retype,
    name,
    check,
    busy: busy || !ready,
    error,
    crowded,
    save,
    revoked,
  };
};

/** The type dialog: Public/Private, the link and its check, Save. */
export const PublicLinkDialog = ({ api, chat, info, close }) => {
  const t = useT();
  const form = useLinkForm(api, chat, info, close);
  const { kind, check, name } = form;
  const publicKind = kind === 'public';
  const hasCollectibles =
    (info?.collectible?.usernames ?? []).length > 0 &&
    typeof api.telegramUsernamesDeactivate === 'function';
  return el(
    FormDialog,
    {
      name: 'chat-type',
      title: t(
        info?.broadcast ? 'chat.manage.typeChannel' : 'chat.manage.typeGroup'
      ),
      onClose: close,
      onSubmit: form.save,
      submit: t('chat.edit.save'),
      busy: form.busy,
      error: form.crowded || !form.error ? null : errorText(t, form.error),
    },
    [
      el(
        'div',
        { key: 'k', className: 'public-link-kinds' },
        ['public', 'private'].map((k) =>
          el(Choice, { key: k, t, kind: k, value: kind, set: form.setKind })
        )
      ),
      publicKind
        ? el(Field, {
            key: 'f',
            label: t('chat.manage.link'),
            name: 'public-link',
            value: form.input,
            placeholder: 't.me/…',
            autoFocus: true,
            autoComplete: 'off',
            onChange: (event) => form.retype(event.target.value),
          })
        : null,
      publicKind ? el(Status, { key: 's', t, name, check }) : null,
      el('p', { key: 'n', className: 'meta' }, t(`chat.manage.${kind}Note`)),
      form.crowded
        ? el(Crowded, { key: 'c', api, t, onRevoked: form.revoked })
        : null,
      hasCollectibles
        ? el(Deactivate, { key: 'd', api, chat: chat.chat, t, done: close })
        : null,
    ]
  );
};
