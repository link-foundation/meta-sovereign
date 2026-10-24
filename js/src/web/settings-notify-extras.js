// Settings → Notifications, the rest (R-Y215; learned, never copied):
// "Reactions" — notify about reactions to messages and to stories from
// nobody, my contacts or everyone, with previews and sound (Telegram's
// own settings) — and "Reset all notifications", asked to be confirmed,
// after which the page loads the notification settings again.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { ConfirmDialog } from './settings-confirm.js';

const el = React.createElement;

export const FROM = ['nobody', 'contacts', 'all'];

const FromSelect = ({ action, label, value, onChange, t }) =>
  el('label', { className: 'media-limit' }, [
    el('span', { key: 'l' }, label),
    el(
      'select',
      {
        key: 's',
        'data-action': action,
        value,
        onChange: (event) => onChange(event.target.value),
      },
      FROM.map((from) =>
        el(
          'option',
          { key: from, value: from },
          t(`settings.reactions.${from}`)
        )
      )
    ),
  ]);

const Check = ({ action, checked, onChange, label }) =>
  el('label', { className: 'check' }, [
    el('input', {
      key: 'i',
      type: 'checkbox',
      checked,
      'data-action': action,
      onChange: (event) => onChange(event.target.checked),
    }),
    ` ${label}`,
  ]);

/** The Reactions section: read when shown, a change written at once. */
export const ReactionNotifySettings = ({ api }) => {
  const t = useT();
  const [row, setRow] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof api?.telegramReactionNotify !== 'function') {
      return undefined;
    }
    let live = true;
    Promise.resolve(api.telegramReactionNotify())
      .then((answer) => live && answer?.ok && setRow(answer))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  if (!row) {
    return null;
  }
  const change = (patch) => {
    const before = row;
    setRow({ ...row, ...patch });
    setFailed(false);
    const undo = () => {
      setRow(before);
      setFailed(true);
    };
    Promise.resolve(api.telegramReactionNotifySet(patch))
      .then((answer) => (answer?.ok ? setRow(answer) : undo()))
      .catch(undo);
  };
  return el('div', { className: 'notify-block', 'data-scope': 'reactions' }, [
    el('h4', { key: 'h' }, t('settings.reactions.title')),
    el(FromSelect, {
      key: 'm',
      action: 'reactions-messages',
      label: t('settings.reactions.messages'),
      value: row.messages,
      onChange: (messages) => change({ messages }),
      t,
    }),
    el(FromSelect, {
      key: 's',
      action: 'reactions-stories',
      label: t('settings.reactions.stories'),
      value: row.stories,
      onChange: (stories) => change({ stories }),
      t,
    }),
    el(Check, {
      key: 'p',
      action: 'reactions-previews',
      checked: row.previews,
      onChange: (previews) => change({ previews }),
      label: t('settings.notifyTg.preview'),
    }),
    el(Check, {
      key: 'o',
      action: 'reactions-sound',
      checked: row.sound,
      onChange: (sound) => change({ sound }),
      label: t('settings.reactions.sound'),
    }),
    failed
      ? el('p', { key: 'f', role: 'alert' }, t('settings.notifyTg.failed'))
      : null,
  ]);
};

/** "Reset all notifications" at the bottom; `onDone` loads the page's again. */
export const ResetNotifications = ({ api, onDone }) => {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  if (typeof api?.telegramNotifyReset !== 'function') {
    return null;
  }
  const reset = () => {
    setAsking(false);
    setFailed(false);
    Promise.resolve(api.telegramNotifyReset())
      .then((answer) => (answer?.ok ? onDone() : setFailed(true)))
      .catch(() => setFailed(true));
  };
  return el('div', { className: 'notify-block', 'data-scope': 'reset' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'danger',
        'data-action': 'notify-reset-all',
        onClick: () => setAsking(true),
      },
      t('settings.notifyReset.button')
    ),
    failed
      ? el('p', { key: 'f', role: 'alert' }, t('settings.notifyTg.failed'))
      : null,
    asking
      ? el(ConfirmDialog, {
          key: 'd',
          name: 'notify-reset-all',
          title: t('settings.notifyReset.button'),
          text: t('settings.notifyReset.ask'),
          yes: t('settings.notifyReset.yes'),
          onYes: reset,
          onNo: () => setAsking(false),
        })
      : null,
  ]);
};
