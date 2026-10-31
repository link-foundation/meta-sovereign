// What a person's profile shows besides their name (R-Y178; learned, never
// copied), as Telegram Desktop does: their birthday with the age when the
// year is known, their personal channel as a card (name, subscribers and
// its latest post; a click opens the channel), the profile colour as the
// card header's background, and the chat list's Birthdays block with the
// contacts whose birthday is today or soon.

import React, { useEffect, useState } from 'react';
import { useLocaleContext, useT } from './i18n.js';
import { ChatAvatar } from './chat-list.js';
import { useBirthdayReminders } from './chat-birthday-reminders.js';
import {
  ageOf,
  birthdayDate,
  colorsOf,
  gradientOf,
  isBirthdayToday,
} from './profile-extras-model.js';

const el = React.createElement;

// The palette Telegram offers, asked once per page load.
let palettes = null;

/** `{ name, profile }` palettes (`[{ id, colors }]`); empty until known. */
export const usePalettes = (api) => {
  const [value, setValue] = useState(palettes ?? { name: [], profile: [] });
  useEffect(() => {
    if (palettes || typeof api?.telegramProfileColors !== 'function') {
      return undefined;
    }
    let live = true;
    api
      .telegramProfileColors()
      .then((answer) => {
        if (answer?.ok) {
          palettes = { name: answer.name ?? [], profile: answer.profile ?? [] };
          live && setValue(palettes);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api]);
  return value;
};

/** The style of a profile header coloured `color` (`{ color }`), or {}. */
export const headerStyle = (color, palette) => {
  const background = Number.isInteger(color?.color)
    ? gradientOf(colorsOf(palette, color.color))
    : undefined;
  return background ? { background } : {};
};

/** The style of a person's profile card from their profile colour (R-Y178). */
export const useProfileTint = (api, info) => {
  const palettes = usePalettes(api);
  return info?.profileColor
    ? headerStyle(info.profileColor, palettes.profile)
    : {};
};

/**
 * The profile column's top box: coloured by the person's profile colour,
 * with their birthday after what `children` show.
 */
export const ProfileFrame = ({ api, info, children }) => {
  const tint = useProfileTint(api, info);
  return el(
    'div',
    {
      className: `profile-head${tint.background ? ' profile-tinted' : ''}`,
      style: tint,
      'data-profile-color': info?.profileColor?.color ?? undefined,
    },
    [
      ...React.Children.toArray(children),
      info?.birthday
        ? el(BirthdayRow, { key: 'bd', birthday: info.birthday })
        : null,
    ]
  );
};

/** The birthday row of a person's profile, or null. */
export const BirthdayRow = ({ birthday, now = new Date() }) => {
  const t = useT();
  const { locale } = useLocaleContext();
  if (!birthday) {
    return null;
  }
  const age = ageOf(birthday, now);
  return el('p', { className: 'profile-birthday', 'data-birthday': 'true' }, [
    el('span', { key: 'l', className: 'meta' }, t('chat.birthday.label')),
    ' ',
    el('span', { key: 'd' }, birthdayDate(birthday, locale)),
    age === null
      ? null
      : el(
          'span',
          { key: 'a', className: 'meta' },
          ` · ${t('chat.birthday.age', { count: age })}`
        ),
    isBirthdayToday(birthday, now)
      ? el('span', { key: 'c', className: 'birthday-mark' }, ' \u{1F382}')
      : null,
  ]);
};

/** A person's personal channel, as the card Telegram's apps show. */
export const PersonalChannelCard = ({ api, chat, info, onOpenChat }) => {
  const t = useT();
  const [card, setCard] = useState(null);
  const person = String(chat?.chat ?? '');
  const has =
    info?.personalChannel === true &&
    /^\d+$/.test(person) &&
    typeof api?.telegramPersonalChannel === 'function';
  useEffect(() => {
    setCard(null);
    if (!has) {
      return undefined;
    }
    let live = true;
    api
      .telegramPersonalChannel({ chat: person })
      .then((a) => live && a?.ok && setCard(a.card ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, has, person]);
  if (!card) {
    return null;
  }
  return el(
    'button',
    {
      type: 'button',
      className: 'personal-channel',
      'data-personal-channel': card.chat,
      onClick: () =>
        onOpenChat?.({
          source: 'telegram',
          chat: card.chat,
          name: card.title,
          kind: 'channel',
        }),
    },
    [
      el(
        'span',
        { key: 'h', className: 'meta' },
        t('chat.personalChannel.title')
      ),
      el('span', { key: 'r', className: 'personal-channel-row' }, [
        el(ChatAvatar, {
          key: 'a',
          api,
          chat: { source: 'telegram', chat: card.chat, name: card.title },
        }),
        el('span', { key: 't', className: 'personal-channel-text' }, [
          el('strong', { key: 'n' }, card.title),
          Number.isInteger(card.members)
            ? el(
                'span',
                { key: 'm', className: 'meta' },
                t('chat.info.subscribers', { count: card.members })
              )
            : null,
        ]),
      ]),
      el(
        'span',
        { key: 'p', className: 'personal-channel-post' },
        card.message?.text || t('chat.personalChannel.noPost')
      ),
    ]
  );
};

/** When a birthday on the list comes: "Today", "Tomorrow", "In 3 days". */
export const whenText = (t, days) => {
  if (days === 0) {
    return t('chat.birthdays.today');
  }
  return days === 1
    ? t('chat.birthdays.tomorrow')
    : t('chat.birthdays.inDays', { count: days });
};

/** Today's outstanding birthday reminders; tomorrow is an explicit setting. */
export const BirthdaysBlock = ({
  api,
  onOpenChat,
  enabled = true,
  chats,
  messages,
}) => {
  const t = useT();
  const list = useBirthdayReminders(api, enabled, chats, messages);
  if (list.length === 0) {
    return null;
  }
  return el(
    'section',
    { className: 'birthdays-block', 'aria-label': t('chat.birthdays.title') },
    [
      el('strong', { key: 'h', className: 'meta' }, t('chat.birthdays.title')),
      el(
        'div',
        { key: 'l', className: 'birthdays-list' },
        list.map((one) =>
          el(
            'button',
            {
              key: one.chat,
              type: 'button',
              className: `birthday-item${one.days === 0 ? ' today' : ''}`,
              'data-birthday-chat': one.chat,
              onClick: () =>
                onOpenChat?.({
                  source: 'telegram',
                  chat: one.chat,
                  name: one.name,
                  kind: 'user',
                }),
            },
            [
              el(ChatAvatar, {
                key: 'a',
                api,
                chat: { source: 'telegram', chat: one.chat, name: one.name },
              }),
              el('span', { key: 'n' }, [
                one.name,
                one.days === 0 ? ' \u{1F382}' : '',
              ]),
              el(
                'span',
                { key: 'w', className: 'meta' },
                whenText(t, one.days)
              ),
            ]
          )
        )
      ),
    ]
  );
};
