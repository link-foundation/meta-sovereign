// A group's and a channel's settings (R-Y165; learned, never copied), as
// Telegram Desktop's Manage group / channel has them: those who may change
// the chat's info get "Settings" in the info column, with only the switches
// that fit the chat and the user (the server's `info.settings.shown`):
//   - a channel: Sign messages (and Show authors' profiles), Discussion
//     (the linked group: pick one, or unlink);
//   - a supergroup: Join to send messages and Approve new members (public
//     or linked to a channel), Hide members, Aggressive anti-spam;
//   - both, for the creator: Restrict saving content.
// Telegram's refusals show in words (hiding members needs 100 of them).
// Restrict saving content is honoured here too: `noForwardsIn` says when
// a chat forbids forwarding, copying and saving, and the message menu
// leaves those items out.

import React, { useState } from 'react';
import { useT } from './i18n.js';
import { Frame } from './chat-readers.js';

const el = React.createElement;

// What was set here lately, per chat: the server keeps a chat's info for
// a minute, so a setting just saved is believed over it for a little longer.
const BELIEVE_MS = 90_000;
const changed = new Map(); // chat -> { at, values, linked? }

const mine = (chat, now) => {
  const hit = changed.get(String(chat));
  return hit && now - hit.at < BELIEVE_MS ? hit : null;
};

const remember = (chat, change) => {
  const was = changed.get(String(chat));
  const fresh = was && Date.now() - was.at < BELIEVE_MS ? was : null;
  changed.set(String(chat), {
    ...fresh,
    ...change,
    values: { ...fresh?.values, ...change.values },
    at: Date.now(),
  });
};

/** A setting's value: just saved here, else the chat's info, else off. */
export const settingValue = (chat, info, key, now = Date.now()) => {
  const saved = mine(chat, now)?.values?.[key];
  return saved ?? Boolean(info?.settings?.values?.[key]);
};

/** The linked discussion group `{ id, title }`, or null. */
export const linkedGroup = (chat, info, now = Date.now()) => {
  const saved = mine(chat, now);
  return saved && 'linked' in saved
    ? saved.linked
    : (info?.settings?.linked ?? null);
};

/** Whether a Telegram chat forbids forwarding, copying and saving. */
export const noForwardsIn = (chat, info) =>
  chat?.source === 'telegram' && settingValue(chat.chat, info, 'noForwards');

/** Whether the info column offers settings: the server listed some. */
export const hasSettings = (chat, info) =>
  chat?.source === 'telegram' &&
  /^-\d+$/.test(String(chat.chat)) &&
  (info?.settings?.shown?.length ?? 0) > 0;

const errorText = (t, code) => {
  const key = `chat.settings.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.settings.err.failed') : text;
};

const Switch = ({ t, name, on, busy, onChange }) =>
  el('label', { className: 'admin-toggle settings-row' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      'data-setting': name,
      checked: on,
      disabled: busy,
      onChange: (e) => onChange(name, e.target.checked),
    }),
    el('span', { key: 'l', className: 'settings-text' }, [
      el('span', { key: 't' }, t(`chat.settings.${name}`)),
      el(
        'small',
        { key: 'h', className: 'meta' },
        t(`chat.settings.${name}.hint`)
      ),
    ]),
  ]);

const GroupChoice = ({ t, groups, busy, onPick }) =>
  groups.phase === 'loading'
    ? el('p', { className: 'meta' }, t('chat.settings.loading'))
    : el(
        'ul',
        { className: 'settings-groups' },
        groups.list.length === 0
          ? el('li', { className: 'meta' }, t('chat.settings.noGroups'))
          : groups.list.map((g) =>
              el(
                'li',
                { key: g.id },
                el(
                  'button',
                  {
                    type: 'button',
                    'data-group': g.id,
                    disabled: busy,
                    onClick: () => onPick(g),
                  },
                  g.title || g.id
                )
              )
            )
      );

const Discussion = ({ t, linked, busy, groups, onChoose, onPick, onUnlink }) =>
  el('div', { className: 'settings-discussion' }, [
    el('strong', { key: 't' }, t('chat.settings.discussion')),
    el(
      'span',
      { key: 'n', className: 'meta', 'data-discussion-now': linked?.id ?? '' },
      linked
        ? ` ${linked.title || linked.id}`
        : ` ${t('chat.settings.noDiscussion')}`
    ),
    el(
      'small',
      { key: 'h', className: 'meta' },
      t('chat.settings.discussion.hint')
    ),
    el('div', { key: 'b', className: 'settings-buttons' }, [
      el(
        'button',
        {
          key: 'c',
          type: 'button',
          'data-action': 'discussion-choose',
          disabled: busy,
          onClick: onChoose,
        },
        t('chat.settings.discussionChoose')
      ),
      linked
        ? el(
            'button',
            {
              key: 'u',
              type: 'button',
              'data-action': 'discussion-unlink',
              disabled: busy,
              onClick: onUnlink,
            },
            t('chat.settings.discussionUnlink')
          )
        : null,
    ]),
    groups ? el(GroupChoice, { key: 'g', t, groups, busy, onPick }) : null,
  ]);

// Each call's answer: saved, or the error in words.
const useSaver = (api, chat, tick) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (ask, onOk) => {
    setBusy(true);
    setError(null);
    const answer = await ask().catch(() => null);
    setBusy(false);
    if (answer?.ok) {
      onOk(answer);
      tick();
    } else {
      setError(answer?.code ?? 'failed');
    }
    return answer;
  };
  return { busy, error, run, setError };
};

const SettingsBody = ({ api, chat, info }) => {
  const t = useT();
  const id = String(chat.chat);
  const [, again] = useState(0);
  const [groups, setGroups] = useState(null);
  const { busy, error, run } = useSaver(api, id, () => again((n) => n + 1));
  const shown = info.settings.shown;
  const value = (key) => settingValue(id, info, key);
  const set = (name, on) =>
    run(
      () => api.telegramChatSettingSet({ chat: id, setting: name, value: on }),
      () =>
        remember(id, {
          values:
            name === 'signatures' && !on
              ? { signatures: false, signatureProfiles: false }
              : { [name]: on },
        })
    );
  const link = (group) =>
    run(
      () => api.telegramDiscussionSet({ chat: id, group: group?.id ?? null }),
      () => {
        remember(id, { linked: group ?? null, values: {} });
        setGroups(null);
      }
    );
  const choose = async () => {
    setGroups({ phase: 'loading', list: [] });
    const answer = await run(
      () => api.telegramDiscussionGroups({ chat: id }),
      (a) => setGroups({ phase: 'ready', list: a.groups ?? [] })
    );
    if (!answer?.ok) {
      setGroups(null);
    }
  };
  const rows = [];
  for (const name of shown) {
    if (name === 'discussion') {
      rows.push(
        el(Discussion, {
          key: name,
          t,
          busy,
          groups,
          linked: linkedGroup(id, info),
          onChoose: choose,
          onPick: link,
          onUnlink: () => link(null),
        })
      );
      continue;
    }
    rows.push(
      el(Switch, { key: name, t, name, on: value(name), busy, onChange: set })
    );
    if (name === 'signatures' && value('signatures')) {
      rows.push(
        el(Switch, {
          key: 'signatureProfiles',
          t,
          name: 'signatureProfiles',
          on: value('signatureProfiles'),
          busy,
          onChange: set,
        })
      );
    }
  }
  return el('div', { className: 'admin-body' }, [
    ...rows,
    error
      ? el(
          'p',
          {
            key: 'e',
            className: 'comments-failed',
            role: 'alert',
            'data-settings-error': error,
          },
          errorText(t, error)
        )
      : null,
  ]);
};

/** "Settings" in the info column for those who may use one, or nothing. */
export const SettingsAction = ({ api, chat, info }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (
    !hasSettings(chat, info) ||
    typeof api?.telegramChatSettingSet !== 'function'
  ) {
    return null;
  }
  const channel = Boolean(info.broadcast);
  return el('div', { className: 'admin-actions' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'admin-open',
        'data-action': 'chat-settings',
        onClick: () => setOpen(true),
      },
      t(channel ? 'chat.settings.openChannel' : 'chat.settings.openGroup')
    ),
    open
      ? el(
          Frame,
          {
            key: 'd',
            title: t(
              channel
                ? 'chat.settings.titleChannel'
                : 'chat.settings.titleGroup'
            ),
            close: () => setOpen(false),
            name: 'chat-settings',
          },
          el(SettingsBody, { api, chat, info })
        )
      : null,
  ]);
};
