// Setting one's emoji status, as Telegram's apps offer it (R-Y162;
// learned, never copied): a row in the profile card shows the current
// status and opens a picker with the default statuses and the recent
// ones, a duration (1 hour, 2 hours, 8 hours, 2 days, until changed) and
// "Remove status". Only Premium accounts can set one: for the others the
// picker says so and nothing in it can be picked.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { EmojiStatus } from './emoji-status.js';
import { CustomEmoji } from './custom-emoji.js';
import { DURATIONS, activeStatus, untilOf } from './emoji-status-model.js';

const el = React.createElement;

const errorText = (t, code) => {
  const key = `chat.emojiStatus.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.emojiStatus.err.failed') : text;
};

/** The profile card's row: the current status; a click opens the picker. */
export const EmojiStatusRow = ({ api, status, onOpen }) => {
  const t = useT();
  const shown = activeStatus(status);
  return el(
    'button',
    {
      type: 'button',
      className: 'emoji-status-row',
      'data-action': 'emoji-status',
      onClick: onOpen,
    },
    [
      el('span', { key: 'l' }, t('chat.emojiStatus.title')),
      shown
        ? el(EmojiStatus, { key: 's', status: shown, api })
        : el(
            'span',
            { key: 'n', className: 'meta' },
            t('chat.emojiStatus.none')
          ),
    ]
  );
};

// The lists, asked once.
const useStatuses = (api) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    api
      .telegramEmojiStatuses()
      .then(
        (a) =>
          live &&
          setState(
            a?.ok ? { phase: 'ready', ...a } : { phase: 'error', code: a?.code }
          )
      )
      .catch(() => live && setState({ phase: 'error' }));
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

const Choices = ({ t, duration, setDuration }) =>
  el('label', { className: 'emoji-status-duration' }, [
    el('span', { key: 'l', className: 'meta' }, t('chat.emojiStatus.for')),
    el(
      'select',
      {
        key: 's',
        'data-field': 'duration',
        value: duration,
        onChange: (e) => setDuration(e.target.value),
      },
      DURATIONS.map((d) =>
        el(
          'option',
          { key: d.key, value: d.key },
          t(`chat.emojiStatus.for.${d.key}`)
        )
      )
    ),
  ]);

const Grid = ({ api, t, name, ids, disabled, onPick }) =>
  ids.length === 0
    ? null
    : el('div', { className: 'emoji-status-section' }, [
        el(
          'span',
          { key: 'h', className: 'meta' },
          t(`chat.emojiStatus.${name}`)
        ),
        el(
          'div',
          { key: 'g', className: 'emoji-status-grid', 'data-grid': name },
          ids.map((id) =>
            el(
              'button',
              {
                key: id,
                type: 'button',
                className: 'emoji-status-pick',
                'data-emoji-status-pick': id,
                disabled,
                onClick: () => onPick(id),
              },
              el(CustomEmoji, { id, text: '⭐', api })
            )
          )
        ),
      ]);

const Picker = ({ api, t, lists, onSet }) => {
  const [duration, setDuration] = useState('forever');
  const seconds = DURATIONS.find((d) => d.key === duration)?.seconds ?? null;
  const locked = !lists.premium;
  const recentIds = lists.recent.map((s) => s.id);
  const defaultIds = lists.defaults
    .map((s) => s.id)
    .filter((id) => !recentIds.includes(id));
  return el(React.Fragment, null, [
    locked
      ? el(
          'p',
          {
            key: 'lock',
            className: 'emoji-status-locked',
            'data-locked': 'true',
          },
          t('chat.emojiStatus.locked')
        )
      : el(Choices, { key: 'd', t, duration, setDuration }),
    el(Grid, {
      key: 'r',
      api,
      t,
      name: 'recent',
      ids: recentIds,
      disabled: locked,
      onPick: (id) => onSet(id, untilOf(seconds)),
    }),
    el(Grid, {
      key: 'f',
      api,
      t,
      name: 'defaults',
      ids: defaultIds,
      disabled: locked,
      onPick: (id) => onSet(id, untilOf(seconds)),
    }),
    !locked && lists.current
      ? el(
          'button',
          {
            key: 'rm',
            type: 'button',
            className: 'emoji-status-remove',
            'data-action': 'remove-emoji-status',
            onClick: () => onSet(null),
          },
          t('chat.emojiStatus.remove')
        )
      : null,
  ]);
};

/** The picker over the profile card; `onChange(status|null)` after a save. */
export const EmojiStatusDialog = ({ api, close, onChange }) => {
  const t = useT();
  const state = useStatuses(api);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // { current } after a save
  const set = async (documentId, until) => {
    const answer = await api
      .telegramEmojiStatusSet({
        documentId,
        ...(until === undefined ? {} : { until }),
      })
      .catch(() => null);
    if (answer?.ok) {
      const next = documentId === null ? null : { id: documentId, until };
      setError(null);
      setSaved({ current: next });
      onChange(next);
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  const ready = state.phase === 'ready';
  const lists = ready
    ? { ...state, ...(saved ? { current: saved.current } : {}) }
    : null;
  let body;
  if (ready) {
    body = el(Picker, { api, t, lists, onSet: set });
  } else if (state.phase === 'loading') {
    body = el('p', { className: 'meta' }, t('chat.profile.loading'));
  }
  return el(
    FormDialog,
    {
      name: 'emoji-status',
      title: t('chat.emojiStatus.title'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.emojiStatus.done'),
      busy: false,
      error:
        error ??
        (state.phase === 'error' ? errorText(t, state.code ?? 'failed') : null),
      outside: true,
    },
    body
  );
};
