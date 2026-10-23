// Settings → Notifications for the connected Telegram account, as
// Telegram Desktop has them (R-Y157; learned, never copied): "Private
// chats", "Groups" and "Channels", each with Notifications on or off,
// Message preview, Stories notifications and its Exceptions — the chats
// that differ, with their state ("Muted", "Muted until …", "Unmuted"); a
// click opens that chat's own notification settings. Everything is
// Telegram's own, so other devices follow. Nothing shows when no Telegram
// account is connected.

import React, { useEffect, useState } from 'react';
import { useDates, useT } from './i18n.js';
import { ChatNotifyDialog } from './chat-notify-settings.js';
import {
  exceptionState,
  rulesFrom,
  setNotifyRules,
  subscribeNotifyRules,
  getNotifyRules,
  withScope,
} from './notify-rules.js';

const el = React.createElement;

const SCOPES = ['users', 'chats', 'broadcasts'];
const KIND = { users: 'private', chats: 'group', broadcasts: 'channel' };

const Toggle = ({ action, checked, onChange, label, disabled }) =>
  el('label', { className: 'check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      checked,
      disabled,
      'data-action': action,
      onChange: (event) => onChange(event.target.checked),
    }),
    ` ${label}`,
  ]);

const stateText = (t, dateTime, exception) => {
  const state = exceptionState(exception);
  return state.key === 'mutedUntil'
    ? t('settings.notifyTg.mutedUntil', { time: dateTime(state.until) })
    : t(`settings.notifyTg.${state.key}`);
};

const Exceptions = ({ list, scope, t, dateTime, onOpen }) =>
  el(
    'ul',
    { className: 'notify-exceptions', 'data-exceptions-list': scope },
    list.length === 0
      ? el('li', { className: 'meta' }, t('settings.notifyTg.noExceptions'))
      : list.map((e) =>
          el(
            'li',
            { key: e.chat },
            el(
              'button',
              {
                type: 'button',
                className: 'notify-exception',
                'data-exception': e.chat,
                onClick: () => onOpen(e),
              },
              [
                el('span', { key: 'n' }, e.name),
                el(
                  'span',
                  { key: 's', className: 'meta' },
                  stateText(t, dateTime, e)
                ),
              ]
            )
          )
        )
  );

const Scope = ({ scope, row, list, onChange, onOpen }) => {
  const t = useT();
  const { dateTime } = useDates();
  const [shown, setShown] = useState(false);
  return el('div', { className: 'notify-scope', 'data-scope': scope }, [
    el('h4', { key: 'h' }, t(`settings.notifyTg.${scope}`)),
    el(Toggle, {
      key: 'on',
      action: `notify-${scope}`,
      checked: row.on,
      onChange: (on) => onChange(scope, { on }),
      label: t('settings.notifyTg.on'),
    }),
    el(Toggle, {
      key: 'pv',
      action: `notify-preview-${scope}`,
      checked: row.previews,
      onChange: (previews) => onChange(scope, { previews }),
      label: t('settings.notifyTg.preview'),
    }),
    el(Toggle, {
      key: 'st',
      action: `notify-stories-${scope}`,
      checked: row.stories,
      onChange: (stories) => onChange(scope, { stories }),
      label: t('settings.notifyTg.stories'),
    }),
    el(
      'button',
      {
        key: 'x',
        type: 'button',
        className: 'notify-exceptions-toggle',
        'data-action': `notify-exceptions-${scope}`,
        'aria-expanded': shown,
        onClick: () => setShown(!shown),
      },
      t('settings.notifyTg.exceptions', { count: list.length })
    ),
    shown
      ? el(Exceptions, { key: 'l', list, scope, t, dateTime, onOpen })
      : null,
  ]);
};

// The rules shared with the notifications, kept up to date here.
const useRules = (api) => {
  const [rules, setRules] = useState(getNotifyRules);
  const [phase, setPhase] = useState('loading');
  useEffect(() => subscribeNotifyRules(setRules), []);
  useEffect(() => {
    if (typeof api?.telegramNotifySettings !== 'function') {
      setPhase('off');
      return undefined;
    }
    let live = true;
    api
      .telegramNotifySettings()
      .then((answer) => {
        if (live && answer?.ok) {
          setNotifyRules(rulesFrom(answer));
          setPhase('ready');
        } else if (live) {
          setPhase('off');
        }
      })
      .catch(() => live && setPhase('off'));
    return () => {
      live = false;
    };
  }, [api]);
  return { rules, phase };
};

/** The three sections; nothing without a connected Telegram account. */
export const TelegramNotifySettings = ({ api }) => {
  const t = useT();
  const { rules, phase } = useRules(api);
  const [open, setOpen] = useState(null);
  const [failed, setFailed] = useState(false);
  if (phase !== 'ready') {
    return null;
  }
  const change = (scope, body) => {
    // Shown at once; Telegram's answer, or its refusal, settles it.
    const before = getNotifyRules();
    setNotifyRules(withScope(before, scope, body));
    setFailed(false);
    api
      .telegramNotifySettingsSet({ scope, ...body })
      .then((answer) => {
        if (answer?.ok) {
          const { on, previews, stories } = answer;
          setNotifyRules(
            withScope(getNotifyRules(), scope, { on, previews, stories })
          );
        } else {
          setNotifyRules(before);
          setFailed(true);
        }
      })
      .catch(() => {
        setNotifyRules(before);
        setFailed(true);
      });
  };
  return el(
    'section',
    {
      className: 'card notifications telegram-notify',
      'aria-labelledby': 'notify-tg-title',
    },
    [
      el(
        'h3',
        { key: 'h', id: 'notify-tg-title' },
        t('settings.notifyTg.title')
      ),
      el('p', { key: 'i', className: 'meta' }, t('settings.notifyTg.intro')),
      ...SCOPES.map((scope) =>
        el(Scope, {
          key: scope,
          scope,
          row: {
            on: true,
            previews: true,
            stories: true,
            ...rules.scopes[scope],
          },
          list: [...rules.exceptions.values()].filter((e) => e.scope === scope),
          onChange: change,
          onOpen: (e) =>
            setOpen({
              chat: e.chat,
              name: e.name,
              kind: KIND[e.scope],
              source: 'telegram',
            }),
        })
      ),
      failed
        ? el('p', { key: 'f', role: 'alert' }, t('settings.notifyTg.failed'))
        : null,
      open
        ? el(ChatNotifyDialog, {
            key: 'd',
            api,
            chat: open,
            onClose: () => setOpen(null),
          })
        : null,
    ]
  );
};
