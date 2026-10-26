// The user's own Telegram profile, as Telegram Desktop's Settings → My
// Account has it (R-Y136; learned, never copied): a button by the chat
// list's title opens a card with the photo (Set photo, Remove photo),
// first and last name, bio with the characters left, username with a live
// check (available, taken, invalid) and the phone, masked until Show.
// Save sends only what changed. The dialog closes on Escape and on a click
// outside; Telegram's refusals show as text.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Field, FormDialog } from './chat-create.js';
import { PhotoButtons, uploadPhoto } from './chat-edit.js';
import { PeerAvatar } from './peer-avatar.js';
import { PrivacyDialog } from './chat-privacy.js';
import {
  ChangePhoneDialog,
  ExportDataButton,
  ExportDataDialog,
} from './chat-account-data.js';
import { StickerSettingsDialog } from './chat-sticker-settings.js';
import { EmojiStatusDialog, EmojiStatusRow } from './chat-emoji-status.js';
import { ProfileUsernames } from './chat-usernames.js';
import { StarsDialog } from './chat-stars.js';
import { ProfileExtrasDialog } from './chat-profile-extras.js';
import { BusinessButton, BusinessDialog } from './business-menu.js';
import {
  LeftChannelsButton,
  LeftChannelsDialog,
} from './chat-left-channels.js';

const el = React.createElement;

const CHECK_MS = 400;
const USERNAME = /^$|^[A-Za-z][A-Za-z0-9_]{3,31}$/;

const errorText = (t, code) => {
  const key = `chat.profile.err.${code}`;
  const text = t(key);
  return text === key ? t('chat.profile.err.failed') : text;
};

/** The phone with its middle hidden: +7 ••• ••• 4567. */
export const maskPhone = (phone) => {
  const digits = String(phone ?? '');
  return digits.length > 6
    ? `${digits.slice(0, 2)} ••• ••• ${digits.slice(-4)}`
    : digits.replace(/\d/g, '•');
};

// The profile, asked once.
const useProfile = (api) => {
  const [state, setState] = useState({ phase: 'loading' });
  useEffect(() => {
    const live = { on: true };
    const show = (next) => live.on && setState(next);
    api
      .telegramProfile()
      .then((a) =>
        show(
          a?.ok
            ? { phase: 'ready', profile: a }
            : { phase: 'error', code: a?.code }
        )
      )
      .catch(() => show({ phase: 'error' }));
    return () => {
      live.on = false;
    };
  }, [api]);
  return state;
};

// The username's availability as it is typed: null, 'checking',
// 'available', 'taken' or 'invalid'.
export const useUsernameCheck = (api, now, was) => {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (now === was) {
      setStatus(null);
      return undefined;
    }
    if (!USERNAME.test(now)) {
      setStatus('invalid');
      return undefined;
    }
    if (now === '') {
      setStatus('available');
      return undefined;
    }
    setStatus('checking');
    let active = true;
    const timer = globalThis.setTimeout(() => {
      api
        .telegramUsernameCheck({ username: now })
        .then((a) => active && setStatus(a?.ok ? a.status : 'invalid'))
        .catch(() => active && setStatus('invalid'));
    }, CHECK_MS);
    return () => {
      active = false;
      globalThis.clearTimeout(timer);
    };
  }, [api, now, was]);
  return status;
};

// The picked image uploaded and set as the photo.
const sendPhoto = async (api, file) => {
  const up = await uploadPhoto(api, file);
  return up.token
    ? ((await api
        .telegramProfilePhoto({ token: up.token })
        .catch(() => null)) ?? {
        code: 'failed',
      })
    : up;
};

const PhotoRow = ({ api, t, profile, setError }) => {
  // undefined: the one Telegram has; a url: just set; null: removed.
  const [shown, setShown] = useState(undefined);
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const done = (answer, next) => {
    if (answer?.ok) {
      setError(null);
      setShown(next);
    } else {
      setError(errorText(t, answer?.code));
    }
  };
  const pick = async (file) => {
    if (file) {
      done(await sendPhoto(api, file), URL.createObjectURL(file));
    }
  };
  const remove = async () =>
    done(
      await api.telegramProfilePhoto({ remove: true }).catch(() => null),
      null
    );
  const hasPhoto = shown === undefined ? profile.hasPhoto : Boolean(shown);
  let picture;
  if (shown) {
    picture = el('img', {
      className: 'avatar profile-photo',
      src: shown,
      alt: '',
    });
  } else if (hasPhoto) {
    picture = el(PeerAvatar, {
      api,
      source: 'telegram',
      peer: profile.id,
      name,
      className: 'avatar profile-photo',
      size: 'b',
    });
  } else {
    picture = el(PeerAvatar, { api, name, className: 'avatar profile-photo' });
  }
  return el('div', { className: 'chat-form-photo profile-photo-row' }, [
    picture,
    el(PhotoButtons, {
      key: 'b',
      t,
      onPick: pick,
      onRemove: remove,
      canRemove: hasPhoto,
    }),
  ]);
};

const BioField = ({ t, value, max, set }) =>
  el('div', { className: 'profile-bio' }, [
    el(Field, {
      key: 'a',
      label: t('chat.profile.about'),
      name: 'about',
      area: true,
      value,
      maxLength: max,
      onChange: (event) => set(event.target.value),
    }),
    el(
      'span',
      { key: 'c', className: 'meta', 'data-about-left': max - value.length },
      t('chat.profile.left', { count: max - value.length })
    ),
  ]);

const UsernameField = ({ t, value, status, set }) =>
  el('div', { className: 'profile-username' }, [
    el(Field, {
      key: 'u',
      label: t('chat.profile.username'),
      name: 'username',
      value,
      maxLength: 32,
      autoCapitalize: 'none',
      spellCheck: false,
      onChange: (event) => set(event.target.value.replace(/^@/, '')),
    }),
    status
      ? el(
          'span',
          {
            key: 's',
            className: `meta profile-username-${status}`,
            'data-username-status': status,
          },
          t(`chat.profile.username.${status}`)
        )
      : null,
  ]);

const PhoneRow = ({ t, phone, onChange }) => {
  const [shown, setShown] = useState(false);
  if (!phone) {
    return null;
  }
  return el('div', { className: 'profile-phone' }, [
    el('span', { key: 'l', className: 'meta' }, t('chat.profile.phone')),
    el(
      'span',
      { key: 'p', 'data-field': 'phone' },
      shown ? phone : maskPhone(phone)
    ),
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        'data-action': 'show-phone',
        onClick: () => setShown(!shown),
      },
      shown ? t('chat.profile.hidePhone') : t('chat.profile.showPhone')
    ),
    // Change phone number (R-Y212) opens over the card.
    onChange
      ? el(
          'button',
          {
            key: 'c',
            type: 'button',
            'data-action': 'change-phone',
            onClick: onChange,
          },
          t('chat.phone.change')
        )
      : null,
  ]);
};

// What differs from the profile Telegram has: the names and bio for
// profile-save, and the username for username-save.
const changes = (profile, form) => {
  const names = {};
  for (const key of ['firstName', 'lastName', 'about']) {
    if (form[key] !== profile[key]) {
      names[key] = form[key];
    }
  }
  return { names, username: form.username !== profile.username };
};

// Saves what changed; resolves to the error code, or null.
const saveChanges = async (api, profile, form) => {
  const { names, username } = changes(profile, form);
  const sent = [];
  if (Object.keys(names).length > 0) {
    sent.push(api.telegramProfileSave(names));
  }
  if (username) {
    sent.push(api.telegramUsernameSave({ username: form.username }));
  }
  const answers = await Promise.all(sent.map((p) => p.catch(() => null)));
  const failed = answers.find((a) => !a?.ok);
  return answers.length > 0 && failed ? (failed.code ?? 'failed') : null;
};

// A card button that opens a dialog over the card.
const OpenButton = ({ action, label, onClick }) =>
  el('button', { type: 'button', 'data-action': action, onClick }, label);

const Card = ({
  api,
  t,
  profile,
  close,
  setError,
  error,
  openPrivacy,
  openStickers,
  openStars,
  openExtras,
  openBusiness,
  openLeft,
  emojiStatus,
  openStatus,
  openPhone,
  openData,
  phone,
}) => {
  const [form, setForm] = useState({
    firstName: profile.firstName,
    lastName: profile.lastName,
    about: profile.about,
    username: profile.username,
  });
  const [busy, setBusy] = useState(false);
  const status = useUsernameCheck(api, form.username, profile.username);
  const set = (key) => (value) => setForm({ ...form, [key]: value });
  const submit = async () => {
    if (form.firstName.trim() === '') {
      setError(errorText(t, 'name-invalid'));
    } else if (status === 'taken' || status === 'invalid') {
      setError(errorText(t, `username-${status}`));
    } else {
      setBusy(true);
      const code = await saveChanges(api, profile, form);
      setBusy(false);
      if (code) {
        setError(errorText(t, code));
      } else {
        close();
      }
    }
  };
  return el(
    FormDialog,
    {
      name: 'my-profile',
      title: t('chat.profile.title'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.profile.save'),
      busy: busy || status === 'checking',
      error,
      outside: true,
    },
    [
      el(PhotoRow, { key: 'p', api, t, profile, setError }),
      el(Field, {
        key: 'f',
        label: t('chat.profile.firstName'),
        name: 'firstName',
        value: form.firstName,
        maxLength: 64,
        onChange: (e) => set('firstName')(e.target.value),
      }),
      el(Field, {
        key: 'l',
        label: t('chat.profile.lastName'),
        name: 'lastName',
        value: form.lastName,
        maxLength: 64,
        onChange: (e) => set('lastName')(e.target.value),
      }),
      el(BioField, {
        key: 'a',
        t,
        value: form.about,
        max: profile.aboutMax || 70,
        set: set('about'),
      }),
      el(UsernameField, {
        key: 'u',
        t,
        value: form.username,
        status,
        set: set('username'),
      }),
      // The collectible usernames besides it (R-Y170).
      el(ProfileUsernames, {
        key: 'un',
        api,
        usernames: profile.usernames ?? [],
      }),
      el(PhoneRow, {
        key: 'ph',
        t,
        phone: phone ?? profile.phone,
        onChange: openPhone,
      }),
      // The emoji status (R-Y162) opens its picker over the card.
      el(EmojiStatusRow, {
        key: 'es',
        api,
        status: emojiStatus,
        onOpen: openStatus,
      }),
      // Birthday, colours and personal channel (R-Y178) open over the card.
      typeof api?.telegramProfileExtras === 'function'
        ? el(
            'button',
            {
              key: 'ex',
              type: 'button',
              'data-action': 'open-profile-extras',
              onClick: openExtras,
            },
            t('chat.extras.open')
          )
        : null,
      // Privacy and security (R-Y139) opens over the card.
      el(OpenButton, {
        key: 'pv',
        action: 'open-privacy',
        label: t('chat.profile.privacy'),
        onClick: openPrivacy,
      }),
      // Export Telegram data (R-Y212) opens over the card.
      el(ExportDataButton, { key: 'xd', api, onClick: openData }),
      // Telegram Stars (R-Y176) opens over the card.
      typeof api?.telegramStarsStatus === 'function'
        ? el(
            'button',
            {
              key: 'st',
              type: 'button',
              'data-action': 'open-stars',
              onClick: openStars,
            },
            t('chat.profile.stars')
          )
        : null,
      // Telegram Business (R-Y179) opens over the card.
      el(BusinessButton, { key: 'bz', api, onClick: openBusiness }),
      // The channels left (R-Y200) open over the card.
      el(LeftChannelsButton, { key: 'lc', api, onClick: openLeft }),
      // Stickers and emoji (R-Y169) opens over the card.
      typeof api?.telegramStickerSets === 'function'
        ? el(OpenButton, {
            key: 'ss',
            action: 'open-sticker-settings',
            label: t('chat.profile.stickers'),
            onClick: openStickers,
          })
        : null,
    ]
  );
};

// The dialogs that open over the card, by the card's button.
const OVER = {
  privacy: PrivacyDialog,
  stickers: StickerSettingsDialog,
  stars: StarsDialog,
  extras: ProfileExtrasDialog,
  business: BusinessDialog,
  left: LeftChannelsDialog,
  status: EmojiStatusDialog,
  phone: ChangePhoneDialog,
  data: ExportDataDialog,
};

const ProfileDialog = ({ api, close }) => {
  const t = useT();
  const state = useProfile(api);
  const [error, setError] = useState(null);
  // Which dialog is over the card, if any.
  const [over, setOver] = useState(null);
  // The emoji status (R-Y162): undefined is the one Telegram has.
  const [chosen, setChosen] = useState(undefined);
  // The phone number just changed (R-Y212): shown over the old one.
  const [phone, setPhone] = useState(undefined);
  if (state.phase === 'ready') {
    const Over = over ? OVER[over] : null;
    // While another dialog is over the card, Escape and a click outside
    // close only that dialog.
    return el(React.Fragment, null, [
      el(Card, {
        key: 'c',
        api,
        t,
        profile: state.profile,
        close: over ? () => {} : close,
        error,
        setError,
        openPrivacy: () => setOver('privacy'),
        openStickers: () => setOver('stickers'),
        openStars: () => setOver('stars'),
        openExtras: () => setOver('extras'),
        openBusiness: () => setOver('business'),
        openLeft: () => setOver('left'),
        emojiStatus: chosen === undefined ? state.profile.emojiStatus : chosen,
        openStatus: () => setOver('status'),
        openPhone: () => setOver('phone'),
        openData: () => setOver('data'),
        phone,
      }),
      Over
        ? el(Over, {
            key: over,
            api,
            close: () => setOver(null),
            ...(over === 'status' ? { onChange: setChosen } : {}),
            ...(over === 'phone' ? { onChanged: setPhone } : {}),
          })
        : null,
    ]);
  }
  return el(
    FormDialog,
    {
      name: 'my-profile',
      title: t('chat.profile.title'),
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

/** Telegram account editing inside the main Profile section. */
export const MyProfile = ({ api }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (typeof api?.telegramProfile !== 'function') {
    return null;
  }
  return el('span', { className: 'my-profile' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'my-profile-btn',
        'data-action': 'my-profile',
        'aria-label': t('chat.profile.open'),
        title: t('chat.profile.open'),
        onClick: () => setOpen(true),
      },
      [
        el(Icon, { key: 'icon', name: 'profile' }),
        ' Telegram · ',
        t('chat.profile.open'),
      ]
    ),
    open
      ? el(ProfileDialog, { key: 'd', api, close: () => setOpen(false) })
      : null,
  ]);
};
