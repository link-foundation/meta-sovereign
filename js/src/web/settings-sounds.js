// Settings → Notification sounds (R-Y181; learned, never copied): whether
// the page plays a sound with a notification, and the account's saved
// ringtones — listed, one added from an audio file (Telegram takes a short,
// small one; the limits are said in words) and one removed. Adding and
// removing write to Telegram, each only after an explicit button (the file
// is chosen first, then "Add ringtone"; "Remove" asks to be confirmed).
// A chat's own sound is chosen in its notification settings
// (./chat-notify-sound.js).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { usePref } from './chat-notify.js';
import { SOUND_KEY, forgetRingtones, playNotifySound } from './notify-sound.js';

const el = React.createElement;

/** The word for what is wrong with a file as a ringtone, or null. */
export const ringtoneProblem = (file, limits, seconds) => {
  if (!file || !/^audio\//.test(file.type || 'audio/x')) {
    return 'bad-type';
  }
  if (limits?.sizeBytes && file.size > limits.sizeBytes) {
    return 'too-big';
  }
  return limits?.seconds && seconds > limits.seconds ? 'too-long' : null;
};

// A file's length in seconds, 0 when the browser cannot tell.
const lengthOf = (file) =>
  new Promise((resolve) => {
    try {
      const url = globalThis.URL.createObjectURL(file);
      const audio = new globalThis.Audio();
      const done = (value) => {
        globalThis.URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) ? value : 0);
      };
      audio.onloadedmetadata = () => done(audio.duration);
      audio.onerror = () => done(0);
      audio.src = url;
    } catch {
      resolve(0);
    }
  });

const useRingtones = (api) => {
  const [state, setState] = useState({
    phase: 'loading',
    list: [],
    limits: null,
  });
  const load = () =>
    api
      .telegramRingtones()
      .then((answer) =>
        setState(
          answer?.ok
            ? {
                phase: 'ready',
                list: answer.ringtones ?? [],
                limits: answer.limits,
              }
            : { phase: 'off', list: [], limits: null }
        )
      )
      .catch(() => setState({ phase: 'off', list: [], limits: null }));
  useEffect(() => {
    if (typeof api?.telegramRingtones === 'function') {
      load();
    } else {
      setState({ phase: 'off', list: [], limits: null });
    }
  }, [api]);
  return { ...state, reload: load };
};

const Row = ({ ringtone, api, armed, onArm, onRemove, t }) =>
  el('li', { className: 'ringtone-row', 'data-ringtone': ringtone.id }, [
    el('span', { key: 'n' }, ringtone.title),
    el(
      'button',
      {
        key: 'p',
        type: 'button',
        'data-action': 'ringtone-play',
        onClick: () => playNotifySound(api, ringtone.id),
      },
      t('settings.sounds.play')
    ),
    el(
      'button',
      {
        key: 'r',
        type: 'button',
        'data-action': armed ? 'ringtone-remove-confirm' : 'ringtone-remove',
        onClick: () => (armed ? onRemove(ringtone) : onArm(ringtone.id)),
      },
      t(armed ? 'settings.sounds.removeConfirm' : 'settings.sounds.remove')
    ),
  ]);

// The limits Telegram sets, in words.
const limitsText = (t, limits) =>
  t('settings.sounds.limits', {
    kb: Math.round((limits?.sizeBytes ?? 307200) / 1024),
    seconds: limits?.seconds ?? 5,
  });

// The words there are for; any other refusal reads as "failed".
const problemOf = (code) => {
  if (code === 'too-large') {
    return 'too-big';
  }
  return ['bad-type', 'too-big', 'too-long'].includes(code) ? code : 'failed';
};

const useAdd = (api, limits, reload) => {
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ busy: false, problem: null });
  const input = useRef(null);
  const pick = async (picked) => {
    setFile(picked);
    if (!picked) {
      return setState({ busy: false, problem: null });
    }
    const seconds = await lengthOf(picked);
    return setState({
      busy: false,
      problem: ringtoneProblem(picked, limits, seconds),
    });
  };
  const add = async () => {
    setState({ busy: true, problem: null });
    const sent = await api.telegramUpload(file).catch(() => null);
    const answer = sent?.token
      ? await api.telegramRingtoneAdd({ token: sent.token }).catch(() => null)
      : sent;
    if (answer?.ok) {
      setFile(null);
      if (input.current) {
        input.current.value = '';
      }
      forgetRingtones();
      await reload();
      setState({ busy: false, problem: null });
    } else {
      setState({ busy: false, problem: problemOf(answer?.code) });
    }
  };
  return { file, pick, add, input, ...state };
};

const Ringtones = ({ api, t }) => {
  const { phase, list, limits, reload } = useRingtones(api);
  const [armed, setArmed] = useState(null);
  const [failed, setFailed] = useState(false);
  const adding = useAdd(api, limits, reload);
  if (phase !== 'ready') {
    return null;
  }
  const remove = async (ringtone) => {
    setArmed(null);
    const answer = await api
      .telegramRingtoneRemove({ id: ringtone.id })
      .catch(() => null);
    setFailed(!answer?.ok);
    forgetRingtones();
    reload();
  };
  return el('div', { className: 'ringtones', 'data-ringtones': '' }, [
    el('h4', { key: 'h' }, t('settings.sounds.saved')),
    el('p', { key: 'l', className: 'meta' }, limitsText(t, limits)),
    el(
      'ul',
      { key: 'u', className: 'ringtone-list' },
      list.length === 0
        ? el('li', { className: 'meta' }, t('settings.sounds.none'))
        : list.map((r) =>
            el(Row, {
              key: r.id,
              ringtone: r,
              api,
              armed: armed === r.id,
              onArm: setArmed,
              onRemove: remove,
              t,
            })
          )
    ),
    el('input', {
      key: 'f',
      ref: adding.input,
      type: 'file',
      accept: 'audio/*',
      'data-action': 'ringtone-file',
      'aria-label': t('settings.sounds.choose'),
      onChange: (event) => adding.pick(event.target.files?.[0] ?? null),
    }),
    el(
      'button',
      {
        key: 'a',
        type: 'button',
        className: 'primary',
        'data-action': 'ringtone-add',
        disabled: !adding.file || adding.busy || Boolean(adding.problem),
        onClick: adding.add,
      },
      t('settings.sounds.add')
    ),
    adding.problem || failed
      ? el(
          'p',
          {
            key: 'e',
            role: 'alert',
            'data-problem': adding.problem ?? 'failed',
          },
          t(`settings.sounds.problem.${adding.problem ?? 'failed'}`, {
            kb: Math.round((limits?.sizeBytes ?? 307200) / 1024),
            seconds: limits?.seconds ?? 5,
          })
        )
      : null,
  ]);
};

export const SoundSettings = ({ api }) => {
  const t = useT();
  const [on, setOn] = usePref(SOUND_KEY, true);
  return el(
    'section',
    { className: 'card sound-settings', 'aria-labelledby': 'sound-title' },
    [
      el('h3', { key: 'h', id: 'sound-title' }, t('settings.sounds.title')),
      el('label', { key: 'on', className: 'check' }, [
        el('input', {
          key: 'i',
          type: 'checkbox',
          checked: on,
          'data-action': 'notify-sound-on',
          onChange: (event) => setOn(event.target.checked),
        }),
        ` ${t('settings.sounds.on')}`,
      ]),
      el('p', { key: 'i', className: 'meta' }, t('settings.sounds.intro')),
      el(Ringtones, { key: 'r', api, t }),
    ]
  );
};
