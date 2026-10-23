// Settings view (issue #27).
//
// Provider credentials, archive import, and live probing now belong to
// Connections -> provider detail. Settings stays available for app-level
// preferences — the appearance (issue #31 / PR #34: theme mode and skin)
// — and points users to the dedicated connection surface.

import React from 'react';
import { useT } from './i18n.js';
import { TelegramNotifySettings } from './settings-notify.js';
import { SKINS, THEME_MODES, useAppearance } from './appearance.js';
import { api } from './dom.js';
import { ChatBackgroundSettings } from './chat-wallpaper.js';
import { FoldersSettings } from './chat-folder-edit.js';
import { useReadReceipts, useShareTyping } from './privacy-prefs.js';
import {
  NOTIFY_KEY,
  NOTIFY_PREVIEW_KEY,
  TITLE_COUNT_KEY,
  usePref,
} from './chat-notify.js';

const el = React.createElement;

const Choices = ({ name, legend, options, value, onChange, label }) =>
  el('fieldset', { className: 'appearance-choices' }, [
    el('legend', { key: 'l' }, legend),
    ...options.map((option) =>
      el('label', { key: option, className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'radio',
          name,
          value: option,
          checked: value === option,
          'data-action': name,
          onChange: () => onChange(option),
        }),
        ` ${label(option)}`,
      ])
    ),
  ]);

/** Theme mode (system, light, dark, auto) and skin (t3, Telegram, …). */
export const AppearanceSettings = ({ appearance }) => {
  const t = useT();
  return el(
    'section',
    { className: 'card appearance', 'aria-labelledby': 'appearance-title' },
    [
      el(
        'h3',
        { key: 'h', id: 'appearance-title' },
        t('settings.appearance.title')
      ),
      el('p', { key: 'p', className: 'meta' }, t('settings.appearance.intro')),
      el(
        'div',
        { key: 'c', className: 'row appearance-row' },
        el(Choices, {
          key: 'theme',
          name: 'theme-mode',
          legend: t('settings.appearance.theme'),
          options: THEME_MODES,
          value: appearance.mode,
          onChange: appearance.setMode,
          label: (mode) => t(`settings.theme.${mode}`),
        }),
        el(Choices, {
          key: 'skin',
          name: 'skin',
          legend: t('settings.appearance.skin'),
          options: SKINS,
          value: appearance.skin,
          onChange: appearance.setSkin,
          label: (skin) => t(`settings.skin.${skin}`),
        })
      ),
    ]
  );
};

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

/**
 * What other people may see: "typing…" (off by default) and that a chat
 * was read (on by default, as in Telegram's own apps).
 */
export const PrivacySettings = () => {
  const t = useT();
  const [shareTyping, setShareTyping] = useShareTyping();
  const [readReceipts, setReadReceipts] = useReadReceipts();
  return el(
    'section',
    { className: 'card privacy', 'aria-labelledby': 'privacy-title' },
    [
      el('h3', { key: 'h', id: 'privacy-title' }, t('settings.privacy.title')),
      el(Check, {
        key: 'typing',
        action: 'share-typing',
        checked: shareTyping,
        onChange: setShareTyping,
        label: t('settings.shareTyping'),
      }),
      el(
        'p',
        { key: 'hint', className: 'meta' },
        t('settings.shareTypingHint')
      ),
      el(Check, {
        key: 'read',
        action: 'read-receipts',
        checked: readReceipts,
        onChange: setReadReceipts,
        label: t('settings.readReceipts'),
      }),
      el(
        'p',
        { key: 'read-hint', className: 'meta' },
        t('settings.readReceiptsHint')
      ),
    ]
  );
};

// What the browser says of notifications: allowed, blocked, or not asked.
const permissionNow = () =>
  typeof globalThis.Notification === 'function'
    ? globalThis.Notification.permission
    : 'unsupported';

/** New messages as the system's notifications, and the title's count (R-Y134). */
export const NotificationSettings = () => {
  const t = useT();
  const [notify, setNotify] = usePref(NOTIFY_KEY, true);
  const [preview, setPreview] = usePref(NOTIFY_PREVIEW_KEY, true);
  const [count, setCount] = usePref(TITLE_COUNT_KEY, true);
  const [permission, setPermission] = React.useState(permissionNow);
  const turn = async (on) => {
    setNotify(on);
    if (on && permission === 'default') {
      const answer = await globalThis.Notification.requestPermission();
      setPermission(answer);
    }
  };
  return el(
    'section',
    { className: 'card notifications', 'aria-labelledby': 'notify-title' },
    [
      el('h3', { key: 'h', id: 'notify-title' }, t('settings.notify.title')),
      el(Check, {
        key: 'on',
        action: 'notify',
        checked: notify && permission !== 'denied',
        onChange: turn,
        label: t('settings.notify.on'),
      }),
      el(
        'p',
        { key: 'state', className: 'meta', 'data-permission': permission },
        t(`settings.notify.${permission}`)
      ),
      el(Check, {
        key: 'preview',
        action: 'notify-preview',
        checked: preview,
        onChange: setPreview,
        label: t('settings.notify.preview'),
      }),
      el(Check, {
        key: 'count',
        action: 'title-count',
        checked: count,
        onChange: setCount,
        label: t('settings.notify.count'),
      }),
    ]
  );
};

export const SettingsView = () => {
  const t = useT();
  const appearance = useAppearance();
  const navigate = () => {
    globalThis.dispatchEvent?.(
      new CustomEvent('meta-sovereign:navigate', {
        detail: { view: 'connections', anchor: '' },
      })
    );
  };

  return el('div', { className: 'col settings-view' }, [
    el('h2', { key: 'h' }, t('settings.title')),
    el('p', { key: 'intro', className: 'meta' }, t('settings.intro')),
    el(
      'button',
      {
        key: 'connections',
        type: 'button',
        className: 'primary',
        onClick: navigate,
        'data-action': 'open-connections',
      },
      t('settings.openConnections')
    ),
    el(AppearanceSettings, { key: 'appearance', appearance }),
    el(ChatBackgroundSettings, { key: 'background', api }),
    el(FoldersSettings, { key: 'folders', api }),
    el(PrivacySettings, { key: 'privacy' }),
    el(NotificationSettings, { key: 'notify' }),
    el(TelegramNotifySettings, { key: 'notify-telegram', api }),
  ]);
};
