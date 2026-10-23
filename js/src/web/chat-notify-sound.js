// A chat's notification sound (R-Y181; learned, never copied), in its
// notification settings: the default sound, none, or one of the account's
// saved ringtones. Choosing only picks; "Save sound" writes it to Telegram
// (notify-chat-set {sound}), and "Play" lets the user hear the choice first.

import React, { useEffect, useState } from 'react';
import { playNotifySound } from './notify-sound.js';

const el = React.createElement;

/** The options: default, none, then the ringtones `[{ id, title }]`. */
export const soundOptions = (t, ringtones = []) => [
  { value: 'default', label: t('chat.notifySet.sound.default') },
  { value: 'none', label: t('chat.notifySet.sound.none') },
  ...ringtones.map((r) => ({ value: r.id, label: r.title })),
];

// The saved ringtones, once, when the picker opens.
const useRingtones = (api) => {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (typeof api?.telegramRingtones !== 'function') {
      return undefined;
    }
    let live = true;
    api
      .telegramRingtones()
      .then((answer) => live && answer?.ok && setList(answer.ringtones ?? []))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  return list;
};

/** `row.sound` is the chat's own; `change({ sound })` writes it. */
export const SoundPicker = ({ api, row, busy, change, t }) => {
  const ringtones = useRingtones(api);
  const kept = row.sound ?? 'default';
  const [choice, setChoice] = useState(kept);
  useEffect(() => setChoice(kept), [kept]);
  const options = soundOptions(t, ringtones);
  // A sound set elsewhere that is not (yet) on the list keeps a line.
  if (!options.some((o) => o.value === choice)) {
    options.push({ value: choice, label: t('chat.notifySet.sound.other') });
  }
  return el('fieldset', { className: 'appearance-choices notify-sound' }, [
    el('legend', { key: 'l' }, t('chat.notifySet.sound')),
    el(
      'select',
      {
        key: 's',
        'data-action': 'notify-sound',
        'aria-label': t('chat.notifySet.sound'),
        value: choice,
        onChange: (event) => setChoice(event.target.value),
      },
      options.map((o) =>
        el('option', { key: o.value, value: o.value }, o.label)
      )
    ),
    el(
      'button',
      {
        key: 'p',
        type: 'button',
        'data-action': 'notify-sound-play',
        onClick: () => playNotifySound(api, choice),
      },
      t('chat.notifySet.sound.play')
    ),
    el(
      'button',
      {
        key: 'v',
        type: 'button',
        'data-action': 'notify-sound-save',
        disabled: busy || choice === kept,
        onClick: () => change({ sound: choice }),
      },
      t('chat.notifySet.sound.save')
    ),
  ]);
};
