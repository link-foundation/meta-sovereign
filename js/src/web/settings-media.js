// Settings → Automatic media download, as Telegram Desktop has it
// (R-Y181; learned, never copied): for private chats, groups and channels
// separately — photos on or off, videos and files up to some size, voice
// and round messages on or off — and "Autoplay GIFs" and "Autoplay
// videos". Kept in this browser (./auto-download.js); the message views
// follow a change at once. Media not allowed is not loaded until asked:
// it shows a download button with its size.

import React from 'react';
import { useT } from './i18n.js';
import {
  LIMITS_MB,
  SCOPES,
  setAutoDownload,
  settingsFromPreset,
  useAutoDownloadSettings,
  withChoice,
} from './auto-download.js';

const el = React.createElement;

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

/** "Never" or "N MB" for a size choice. */
export const limitLabel = (t, megabytes) =>
  megabytes > 0
    ? t('settings.media.upTo', { count: megabytes })
    : t('settings.media.never');

// Kept sizes that are not among the offered ones stay selectable.
const optionsFor = (value) =>
  LIMITS_MB.includes(value)
    ? LIMITS_MB
    : [...LIMITS_MB, value].sort((a, b) => a - b);

const LimitSelect = ({ action, value, label, onChange, t }) =>
  el('label', { className: 'media-limit' }, [
    el('span', { key: 'l' }, label),
    el(
      'select',
      {
        key: 's',
        'data-action': action,
        value,
        onChange: (event) => onChange(Number(event.target.value)),
      },
      optionsFor(value).map((n) =>
        el('option', { key: n, value: n }, limitLabel(t, n))
      )
    ),
  ]);

const Scope = ({ scope, row, onChange, t }) =>
  el('div', { className: 'notify-scope', 'data-media-scope': scope }, [
    el('h4', { key: 'h' }, t(`settings.notifyTg.${scope}`)),
    el(Check, {
      key: 'p',
      action: `auto-photos-${scope}`,
      checked: row.photos,
      onChange: (photos) => onChange(scope, { photos }),
      label: t('settings.media.photos'),
    }),
    el(LimitSelect, {
      key: 'v',
      action: `auto-video-${scope}`,
      value: row.videoMb,
      label: t('settings.media.videos'),
      onChange: (videoMb) => onChange(scope, { videoMb }),
      t,
    }),
    el(LimitSelect, {
      key: 'f',
      action: `auto-file-${scope}`,
      value: row.fileMb,
      label: t('settings.media.files'),
      onChange: (fileMb) => onChange(scope, { fileMb }),
      t,
    }),
    el(Check, {
      key: 'r',
      action: `auto-voice-${scope}`,
      checked: row.voice,
      onChange: (voice) => onChange(scope, { voice }),
      label: t('settings.media.voice'),
    }),
  ]);

// "Reset to default": Telegram's medium preset when the account answers,
// else the page's own defaults (R-Y215).
const resetToDefault = (api) =>
  Promise.resolve(api?.telegramAutoDownloadPreset?.())
    .catch(() => null)
    .then((answer) =>
      setAutoDownload(settingsFromPreset(answer?.ok ? answer.medium : null))
    );

export const MediaSettings = ({ api }) => {
  const t = useT();
  const settings = useAutoDownloadSettings();
  const change = (scope, body) =>
    setAutoDownload(withChoice(settings, scope, body));
  return el(
    'section',
    { className: 'card media-settings', 'aria-labelledby': 'media-title' },
    [
      el('h3', { key: 'h', id: 'media-title' }, t('settings.media.title')),
      el('p', { key: 'i', className: 'meta' }, t('settings.media.intro')),
      ...SCOPES.map((scope) =>
        el(Scope, {
          key: scope,
          scope,
          row: settings[scope],
          onChange: change,
          t,
        })
      ),
      el(Check, {
        key: 'gif',
        action: 'autoplay-gif',
        checked: settings.autoplayGif,
        onChange: (autoplayGif) => change(null, { autoplayGif }),
        label: t('settings.media.autoplayGif'),
      }),
      el(Check, {
        key: 'video',
        action: 'autoplay-video',
        checked: settings.autoplayVideo,
        onChange: (autoplayVideo) => change(null, { autoplayVideo }),
        label: t('settings.media.autoplayVideo'),
      }),
      el(
        'button',
        {
          key: 'reset',
          type: 'button',
          'data-action': 'auto-download-reset',
          onClick: () => resetToDefault(api),
        },
        t('settings.media.reset')
      ),
    ]
  );
};
