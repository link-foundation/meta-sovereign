// Editing the profile's extras, as Telegram Desktop's Settings → My
// Account → Edit Profile has them (R-Y178; learned, never copied): the
// birthday (day, month, an optional year, remove), the name colour and the
// profile colour (Premium) each with a background emoji and a preview — a
// reply quote and the profile card's header — and the personal channel
// chosen from the user's public channels. Nothing is written until Save,
// which sends only what changed.

import React, { useEffect, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { FormDialog } from './chat-create.js';
import { CustomEmoji } from './custom-emoji.js';
import { usePalettes, headerStyle } from './chat-person-extras.js';
import {
  birthYears,
  birthdayOfForm,
  colorsOf,
  daysIn,
  formOfBirthday,
  monthName,
  sameBirthday,
} from './profile-extras-model.js';

const el = React.createElement;
const EMOJI_CHOICES = 12;

const errorText = (t, code) => {
  const key = `chat.extras.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.extras.err.failed') : text;
};

// The profile's extras, the offered channels and emoji, asked once.
const useExtras = (api) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    let live = true;
    Promise.all([
      api.telegramProfileExtras(),
      api.telegramPersonalChannels?.().catch(() => null),
      api.telegramEmojiStatuses?.().catch(() => null),
    ])
      .then(([extras, channels, emoji]) => {
        if (live) {
          setState(
            extras?.ok
              ? {
                  phase: 'ready',
                  extras,
                  channels: channels?.ok ? channels.channels : [],
                  emoji: (emoji?.ok ? (emoji.defaults ?? []) : [])
                    .slice(0, EMOJI_CHOICES)
                    .map((s) => s.id),
                }
              : { phase: 'error', code: extras?.code }
          );
        }
      })
      .catch(() => live && setState({ phase: 'error' }));
    return () => {
      live = false;
    };
  }, [api]);
  return state;
};

const Select = ({ label, name, value, onChange, children }) =>
  el('label', { className: 'chat-form-field extras-select' }, [
    el('span', { key: 'l', className: 'meta' }, label),
    el(
      'select',
      { key: 's', name, 'data-field': name, value, onChange },
      children
    ),
  ]);

const BirthdayEditor = ({ t, form, set }) => {
  const { locale } = useLocaleContext();
  const month = Number(form.month) || 1;
  const year = form.year === '' ? undefined : Number(form.year);
  const blank = el('option', { key: '-', value: '' }, '—');
  return el('fieldset', { className: 'extras-birthday' }, [
    el('legend', { key: 'l' }, t('chat.extras.birthday')),
    el(
      Select,
      {
        key: 'd',
        label: t('chat.extras.day'),
        name: 'birthday-day',
        value: form.day,
        onChange: (e) => set({ ...form, day: e.target.value }),
      },
      [
        blank,
        ...Array.from({ length: daysIn(month, year) }, (_, i) =>
          el('option', { key: i + 1, value: String(i + 1) }, String(i + 1))
        ),
      ]
    ),
    el(
      Select,
      {
        key: 'm',
        label: t('chat.extras.month'),
        name: 'birthday-month',
        value: form.month,
        onChange: (e) => set({ ...form, month: e.target.value }),
      },
      [
        blank,
        ...Array.from({ length: 12 }, (_, i) =>
          el(
            'option',
            { key: i + 1, value: String(i + 1) },
            monthName(i + 1, locale)
          )
        ),
      ]
    ),
    el(
      Select,
      {
        key: 'y',
        label: t('chat.extras.year'),
        name: 'birthday-year',
        value: form.year,
        onChange: (e) => set({ ...form, year: e.target.value }),
      },
      [
        blank,
        ...birthYears().map((y) =>
          el('option', { key: y, value: String(y) }, String(y))
        ),
      ]
    ),
    el(
      'button',
      {
        key: 'r',
        type: 'button',
        'data-action': 'birthday-remove',
        disabled: form.day === '' && form.month === '' && form.year === '',
        onClick: () => set({ day: '', month: '', year: '' }),
      },
      t('chat.extras.birthdayRemove')
    ),
  ]);
};

// One colour swatch.
const Swatch = ({ id, colors, chosen, locked, onPick, kind }) =>
  el('button', {
    type: 'button',
    className: `extras-swatch${chosen ? ' chosen' : ''}`,
    'data-swatch': `${kind}:${id}`,
    'aria-pressed': chosen,
    disabled: locked,
    style: {
      background: `linear-gradient(135deg, ${colors.join(', ')})`,
    },
    onClick: () => onPick(id),
  });

// The previews: a reply quote in the name colour, the profile header.
const Preview = ({ t, kind, value, palette, name }) => {
  const colors = colorsOf(palette, value.color) ?? [];
  if (kind === 'profile') {
    return el(
      'div',
      {
        className: 'extras-preview extras-preview-profile',
        'data-preview': 'profile',
        style: headerStyle(value, palette),
      },
      el('strong', null, name)
    );
  }
  return el(
    'div',
    {
      className: 'extras-preview extras-preview-quote',
      'data-preview': 'name',
      style: colors[0] ? { '--peer-color': colors[0] } : undefined,
    },
    [
      el('strong', { key: 'n', className: 'extras-quote-name' }, name),
      el(
        'span',
        { key: 'q', className: 'extras-quote-text' },
        t('chat.extras.previewQuote')
      ),
      value.emoji
        ? el('span', { key: 'e', className: 'extras-quote-emoji' }, '✦')
        : null,
    ]
  );
};

const EmojiChoices = ({ api, t, kind, ids, value, locked, set }) =>
  ids.length === 0
    ? null
    : el('div', { className: 'extras-emojis', role: 'group' }, [
        el(
          'button',
          {
            key: 'none',
            type: 'button',
            className: value.emoji ? '' : 'chosen',
            'data-emoji': `${kind}:none`,
            disabled: locked,
            onClick: () => set({ ...value, emoji: null }),
          },
          t('chat.extras.noEmoji')
        ),
        ...ids.map((id) =>
          el(
            'button',
            {
              key: id,
              type: 'button',
              className: value.emoji === id ? 'chosen' : '',
              'data-emoji': `${kind}:${id}`,
              disabled: locked,
              onClick: () => set({ ...value, emoji: id }),
            },
            el(CustomEmoji, { id, text: '✦', api })
          )
        ),
      ]);

const ColorEditor = ({
  api,
  t,
  kind,
  premium,
  palette,
  emoji,
  value,
  set,
  name,
}) => {
  const locked = !premium;
  return el('fieldset', { className: 'extras-colors', 'data-colors': kind }, [
    el(
      'legend',
      { key: 'l' },
      t(
        kind === 'profile'
          ? 'chat.extras.profileColor'
          : 'chat.extras.nameColor'
      )
    ),
    el(Preview, { key: 'p', t, kind, value, palette, name }),
    locked
      ? el(
          'p',
          { key: 'k', className: 'meta', 'data-locked': 'true' },
          t('chat.extras.premium')
        )
      : null,
    el('div', { key: 's', className: 'extras-swatches' }, [
      el(
        'button',
        {
          key: 'none',
          type: 'button',
          className: value.color === null ? 'chosen' : '',
          'data-swatch': `${kind}:none`,
          disabled: locked,
          onClick: () => set({ color: null, emoji: null }),
        },
        t('chat.extras.noColor')
      ),
      ...palette.map((option) =>
        el(Swatch, {
          key: option.id,
          kind,
          id: option.id,
          colors: option.colors,
          chosen: value.color === option.id,
          locked,
          onPick: (id) => set({ ...value, color: id }),
        })
      ),
    ]),
    el(EmojiChoices, {
      key: 'e',
      api,
      t,
      kind,
      ids: emoji,
      value,
      locked,
      set,
    }),
  ]);
};

const ChannelEditor = ({ t, channels, value, set }) =>
  el(
    Select,
    {
      label: t('chat.extras.personalChannel'),
      name: 'personal-channel',
      value: value ?? '',
      onChange: (e) => set(e.target.value || null),
    },
    [
      el('option', { key: '-', value: '' }, t('chat.extras.noChannel')),
      ...channels.map((c) =>
        el('option', { key: c.chat, value: c.chat }, c.title || c.chat)
      ),
    ]
  );

const sameColor = (a, b) =>
  (a?.color ?? null) === (b?.color ?? null) &&
  (a?.emoji ?? null) === (b?.emoji ?? null);

const colorBody = (forProfile, value) => ({
  forProfile,
  ...(value.color === null ? {} : { color: value.color }),
  ...(value.emoji === null ? {} : { emoji: value.emoji }),
});

/** The writes the form makes, as [call name, body]; only what changed. */
export const writesOf = (was, form) => {
  const writes = [];
  if (!sameBirthday(was.birthday, form.birthday)) {
    writes.push([
      'telegramBirthdaySave',
      form.birthday ? form.birthday : { remove: true },
    ]);
  }
  if (!sameColor(was.color, form.color)) {
    writes.push(['telegramColorSave', colorBody(false, form.color)]);
  }
  if (!sameColor(was.profileColor, form.profileColor)) {
    writes.push(['telegramColorSave', colorBody(true, form.profileColor)]);
  }
  if ((was.personalChannel?.chat ?? null) !== form.channel) {
    writes.push([
      'telegramPersonalChannelSave',
      form.channel ? { chat: form.channel } : { remove: true },
    ]);
  }
  return writes;
};

// The form's start, from what Telegram has.
const startOf = (extras) => ({
  birthday: extras.birthday,
  color: {
    color: extras.color?.color ?? null,
    emoji: extras.color?.emoji ?? null,
  },
  profileColor: {
    color: extras.profileColor?.color ?? null,
    emoji: extras.profileColor?.emoji ?? null,
  },
  channel: extras.personalChannel?.chat ?? null,
});

const Card = ({ api, t, data, close }) => {
  const { extras, channels, emoji } = data;
  const palettes = usePalettes(api);
  const [form, setForm] = useState(startOf(extras));
  const [fields, setFields] = useState(formOfBirthday(extras.birthday));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const birthday = birthdayOfForm(fields);
  const partial =
    fields.day !== '' || fields.month !== '' || fields.year !== '';
  const submit = async () => {
    if (partial && !birthday) {
      return setError(errorText(t, 'birthday-invalid'));
    }
    const writes = writesOf(extras, { ...form, birthday });
    setBusy(true);
    for (const [call, body] of writes) {
      const answer = await api[call](body).catch(() => null);
      if (!answer?.ok) {
        setBusy(false);
        return setError(errorText(t, answer?.code));
      }
    }
    setBusy(false);
    return close();
  };
  const channelList = [
    ...channels,
    ...(extras.personalChannel &&
    !channels.some((c) => c.chat === extras.personalChannel.chat)
      ? [extras.personalChannel]
      : []),
  ];
  return el(
    FormDialog,
    {
      name: 'profile-extras',
      title: t('chat.extras.title'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.profile.save'),
      busy,
      error,
      outside: true,
    },
    [
      el(BirthdayEditor, { key: 'b', t, form: fields, set: setFields }),
      el(ColorEditor, {
        key: 'n',
        api,
        t,
        kind: 'name',
        premium: extras.premium,
        palette: palettes.name,
        emoji,
        value: form.color,
        set: (color) => setForm({ ...form, color }),
        name: t('chat.extras.previewName'),
      }),
      el(ColorEditor, {
        key: 'p',
        api,
        t,
        kind: 'profile',
        premium: extras.premium,
        palette: palettes.profile,
        emoji,
        value: form.profileColor,
        set: (profileColor) => setForm({ ...form, profileColor }),
        name: t('chat.extras.previewName'),
      }),
      el(ChannelEditor, {
        key: 'c',
        t,
        channels: channelList,
        value: form.channel,
        set: (channel) => setForm({ ...form, channel }),
      }),
    ]
  );
};

/** The dialog over the profile card; closes when saved or cancelled. */
export const ProfileExtrasDialog = ({ api, close }) => {
  const t = useT();
  const state = useExtras(api);
  if (state.phase === 'ready') {
    return el(Card, { api, t, data: state, close });
  }
  return el(
    FormDialog,
    {
      name: 'profile-extras',
      title: t('chat.extras.title'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.create.cancel'),
      busy: false,
      error:
        state.phase === 'error' ? errorText(t, state.code ?? 'failed') : null,
      outside: true,
    },
    state.phase === 'loading'
      ? el('p', { className: 'meta' }, t('chat.profile.loading'))
      : null
  );
};
