// Sharing a place and a contact from the paperclip's menu, as Telegram's
// apps do (R-Y142; learned, never copied):
// - "Location": the browser's position, asked only when "Use my location"
//   is pressed (a refusal or a timeout is said in words), or a latitude
//   and a longitude typed (-90…90, -180…180); the map picture of the
//   place and the accuracy radius are shown; "Send location" shares it
//   once, or for 15 minutes, 1 hour or 8 hours as a live location.
// - "Contact": the account's contacts to search and pick (their phones
//   are read by the server), or a name and a phone typed.
// The answer comes through the live handler as for any send.
//
// Telegram user accounts only, as files are (./chat-attach.js).

import React, { useEffect, useRef, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { composerReplyId } from './forum-topics.js';
import { sendAsField } from './chat-send-as.js';

const el = React.createElement;

export const LIVE_CHOICES = [0, 900, 3600, 28800];
export const MAX_ACCURACY = 1500;
const PHONE = /^\+?[0-9][0-9 ()-]{3,22}[0-9]$/;

export const canShare = (state, api) =>
  state.current?.source === 'telegram' &&
  state.telegram?.kind === 'user' &&
  typeof api?.telegramSendLocation === 'function';

/** A typed coordinate within ±`limit` (a comma may be the point), else null. */
export const parseCoordinate = (text, limit) => {
  const raw = String(text ?? '')
    .trim()
    .replace(',', '.');
  if (!/^[+-]?\d{1,3}(\.\d{1,10})?$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return Math.abs(value) <= limit ? value : null;
};

/** The body for POST /api/telegram/send-location, or null while not valid. */
export const placeBody = ({ lat, lon, accuracy = null, live = 0 }) => {
  const latitude = parseCoordinate(lat, 90);
  const longitude = parseCoordinate(lon, 180);
  if (latitude === null || longitude === null) {
    return null;
  }
  const radius = Math.round(Number(accuracy));
  return {
    lat: latitude,
    lon: longitude,
    ...(radius > 0 ? { accuracy: Math.min(radius, MAX_ACCURACY) } : {}),
    ...(LIVE_CHOICES.includes(live) && live > 0 ? { live } : {}),
  };
};

/** The body for POST /api/telegram/send-contact, or null while not valid. */
export const typedContactBody = ({ firstName, lastName, phone }) =>
  String(firstName ?? '').trim() && PHONE.test(String(phone ?? '').trim())
    ? {
        firstName: String(firstName).trim().slice(0, 64),
        lastName: String(lastName ?? '')
          .trim()
          .slice(0, 64),
        phone: String(phone).trim(),
      }
    : null;

/** The contacts whose name or username holds `query`. */
export const filterContacts = (contacts, query) => {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return (contacts ?? []).filter((c) => {
    const hay = `${c.name ?? ''} ${c.username ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
};

/** A refusal of the browser's position, as the text key to show. */
export const positionErrorKey = (error) => {
  switch (error?.code) {
    case 1:
      return 'chat.share.denied';
    case 3:
      return 'chat.share.timeout';
    default:
      return 'chat.share.unavailable';
  }
};

/** Why a share failed, in words. */
export const shareErrorText = (t, answer) => {
  if (answer?.code === 'no-phone') {
    return t('chat.share.noPhone');
  }
  return answer?.code === 'send-as-invalid'
    ? t('chat.sendAs.invalid')
    : t('chat.share.failed', { error: answer?.error ?? answer?.code ?? '' });
};

const newClientId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `share-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** The dialogs' state: which is open, sending, and the last failure. */
export const useShare = ({ state, api, composer }) => {
  const enabled = canShare(state, api);
  const [shown, setShown] = useState(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState(null);
  const key = state.current?.key;
  useEffect(() => setShown(null), [key]);

  const open = (kind) => {
    setFailure(null);
    setShown(kind);
  };
  const run = async (call, body) => {
    if (sending || !enabled) {
      return;
    }
    setSending(true);
    setFailure(null);
    const reply = composerReplyId(composer);
    const answer = await call({
      chat: String(state.current.chat),
      ...body,
      ...sendAsField(state.current.chat),
      ...(reply ? { replyTo: reply } : {}),
      clientId: newClientId(),
    }).catch((error) => ({ error: error.message }));
    setSending(false);
    if (answer?.ok) {
      composer?.clearReplyTo?.();
      setShown(null);
      return;
    }
    setFailure(answer ?? { error: 'not sent' });
  };
  return {
    enabled,
    chat: state.current?.chat ? String(state.current.chat) : null,
    shown: enabled ? shown : null,
    sending,
    failure,
    show: open,
    // The paperclip menu's entries, when sharing is possible.
    menu: enabled
      ? {
          onLocation: () => open('location'),
          onContact: () => open('contact'),
        }
      : {},
    close: () => setShown(null),
    sendLocation: (body) => run(api.telegramSendLocation, body),
    sendContact: (body) => run(api.telegramSendContact, body),
  };
};

const useEsc = (onClose) => {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current?.();
      }
    };
    globalThis.addEventListener?.('keydown', onKey);
    return () => globalThis.removeEventListener?.('keydown', onKey);
  }, []);
};

const liveLabel = (t, seconds) =>
  seconds === 0
    ? t('chat.share.liveOff')
    : t('chat.share.liveFor', {
        period:
          seconds >= 3600
            ? t('chat.share.hours', { count: seconds / 3600 })
            : t('chat.share.minutes', { count: seconds / 60 }),
      });

const Shell = ({ title, name, children }) =>
  el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    el('div', { className: `delete-dialog share-dialog ${name}` }, [
      el('h3', { key: 'h' }, title),
      ...children,
    ])
  );

const Field = ({ name, label, value, onChange, ...rest }) =>
  el('label', { className: 'share-field' }, [
    el('span', { key: 'l' }, label),
    el('input', {
      key: 'i',
      type: 'text',
      value,
      'data-field': name,
      'aria-label': label,
      onChange: (e) => onChange(e.target.value),
      ...rest,
    }),
  ]);

const mapScale = () =>
  Math.min(3, Math.max(1, Math.round(globalThis.devicePixelRatio || 1)));

// The map picture of the typed place, when it is valid.
const usePreview = (api, body) => {
  const [url, setUrl] = useState(null);
  const lat = body?.lat;
  const lon = body?.lon;
  useEffect(() => {
    setUrl(null);
    if (lat === undefined || typeof api?.telegramMapUrl !== 'function') {
      return undefined;
    }
    const stop = new AbortController();
    api
      .telegramMapUrl({ lat, lon, w: 300, h: 150, zoom: 15, scale: mapScale() })
      .then((next) => stop.signal.aborted || setUrl(next ?? null))
      .catch(() => {});
    return () => stop.abort();
  }, [api, lat, lon]);
  return url;
};

// The browser's position, asked now: { lat, lon, accuracy } or an error key.
const askPosition = () =>
  new Promise((resolve) => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo?.getCurrentPosition) {
      resolve({ error: 'chat.share.unavailable' });
      return;
    }
    geo.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (error) => resolve({ error: positionErrorKey(error) }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  });

const Preview = ({ url, accuracy, t }) =>
  el('div', { className: 'share-preview', 'data-share': 'preview' }, [
    url
      ? el('img', {
          key: 'm',
          src: url,
          alt: '',
          width: 300,
          height: 150,
          draggable: false,
        })
      : null,
    accuracy
      ? el(
          'span',
          { key: 'a', className: 'meta', 'data-share': 'accuracy' },
          t('chat.share.accuracy', { meters: Math.round(accuracy) })
        )
      : null,
  ]);

/** The words on a recent place's quick pick: its name, else its point. */
export const placeLabel = (place) =>
  place.title || `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`;

// The places lately shared in the chat (R-Y208), asked once; none when
// they cannot be read (the quick picks are only a help).
const useRecentPlaces = (api, chat) => {
  const [places, setPlaces] = useState([]);
  useEffect(() => {
    if (!chat || typeof api?.telegramRecentLocations !== 'function') {
      return undefined;
    }
    let active = true;
    api
      .telegramRecentLocations({ chat })
      .catch(() => null)
      .then((answer) => {
        if (active && answer?.ok) {
          setPlaces((answer.places ?? []).slice(0, 8));
        }
      });
    return () => {
      active = false;
    };
  }, [api, chat]);
  return places;
};

const RecentPlaces = ({ places, onPick, t }) =>
  places.length === 0
    ? null
    : el('div', { className: 'share-recent', 'data-share': 'recent' }, [
        el('span', { key: 'h', className: 'meta' }, t('chat.share.recent')),
        ...places.map((place) =>
          el(
            'button',
            {
              key: place.id,
              type: 'button',
              className: 'share-recent-pick',
              'data-action': 'location-recent',
              'data-lat': place.lat,
              'data-lon': place.lon,
              title: place.address ?? undefined,
              onClick: () => onPick(place),
            },
            [
              el(Icon, { key: 'i', name: 'map-pin', size: 14 }),
              el('span', { key: 't' }, placeLabel(place)),
            ]
          )
        ),
      ]);

// "Share for": a place once or live for a time.
const LiveField = ({ value, set, t }) =>
  el('label', { className: 'share-field' }, [
    el('span', { key: 'l' }, t('chat.share.liveLabel')),
    el(
      'select',
      {
        key: 's',
        'data-field': 'live',
        value,
        onChange: (e) => set({ live: Number(e.target.value) }),
      },
      LIVE_CHOICES.map((seconds) =>
        el('option', { key: seconds, value: seconds }, liveLabel(t, seconds))
      )
    ),
  ]);

/** "Location": the position asked or typed, a preview, Send. */
export const LocationDialog = ({ share, api }) => {
  const t = useT();
  const [form, setForm] = useState({ lat: '', lon: '', live: 0 });
  const [accuracy, setAccuracy] = useState(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(null);
  useEsc(share.close);
  const recent = useRecentPlaces(api, share.chat);
  const body = placeBody({ ...form, accuracy });
  const url = usePreview(api, body);
  const set = (change) => {
    setForm((now) => ({ ...now, ...change }));
    if (change.lat !== undefined || change.lon !== undefined) {
      setAccuracy(null);
    }
  };
  const use = async () => {
    setAsking(true);
    setProblem(null);
    const place = await askPosition();
    setAsking(false);
    if (place.error) {
      setProblem(place.error);
      return;
    }
    setForm((now) => ({
      ...now,
      lat: place.lat.toFixed(6),
      lon: place.lon.toFixed(6),
    }));
    setAccuracy(place.accuracy);
  };
  return el(
    Shell,
    { title: t('chat.share.locationTitle'), name: 'share-location' },
    [
      el(
        'button',
        {
          key: 'use',
          type: 'button',
          className: 'share-use',
          'data-action': 'location-use',
          disabled: asking,
          onClick: use,
        },
        [
          el(Icon, { key: 'i', name: 'map-pin', size: 16 }),
          el('span', { key: 't' }, t('chat.share.use')),
        ]
      ),
      el(RecentPlaces, {
        key: 'recent',
        places: recent,
        t,
        onPick: (place) =>
          set({ lat: String(place.lat), lon: String(place.lon), live: 0 }),
      }),
      problem
        ? el(
            'p',
            {
              key: 'p',
              className: 'schedule-hint',
              role: 'alert',
              'data-share': 'problem',
            },
            t(problem)
          )
        : null,
      el('div', { key: 'f', className: 'share-fields' }, [
        el(Field, {
          key: 'lat',
          name: 'lat',
          label: t('chat.share.lat'),
          value: form.lat,
          inputMode: 'decimal',
          onChange: (lat) => set({ lat }),
        }),
        el(Field, {
          key: 'lon',
          name: 'lon',
          label: t('chat.share.lon'),
          value: form.lon,
          inputMode: 'decimal',
          onChange: (lon) => set({ lon }),
        }),
      ]),
      form.lat !== '' && form.lon !== '' && !body
        ? el(
            'p',
            {
              key: 'v',
              className: 'schedule-hint',
              role: 'status',
              'data-share': 'invalid',
            },
            t('chat.share.invalid')
          )
        : null,
      body ? el(Preview, { key: 'pv', url, accuracy: body.accuracy, t }) : null,
      el(LiveField, { key: 'live', value: form.live, set, t }),
      share.failure
        ? el(
            'p',
            {
              key: 'e',
              className: 'schedule-hint',
              role: 'alert',
              'data-share': 'failure',
            },
            shareErrorText(t, share.failure)
          )
        : null,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'primary',
            'data-action': 'location-send',
            disabled: !body || share.sending,
            onClick: () => body && share.sendLocation(body),
          },
          t('chat.share.sendLocation')
        ),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: share.close },
          t('common.cancel')
        ),
      ]),
    ]
  );
};

const ContactRow = ({ contact, picked, onPick }) =>
  el(
    'li',
    { key: contact.id },
    el(
      'button',
      {
        type: 'button',
        className: `share-contact${picked ? ' is-picked' : ''}`,
        'data-contact': contact.id,
        'aria-pressed': picked,
        onClick: () => onPick(contact.id),
      },
      [
        el(Icon, { key: 'i', name: 'user', size: 18 }),
        el('span', { key: 'n' }, contact.name),
        contact.username
          ? el('span', { key: 'u', className: 'meta' }, `@${contact.username}`)
          : null,
      ]
    )
  );

// The account's contacts, asked once when the list is shown.
const useContacts = (api) => {
  const [list, setList] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(api?.telegramChatContacts?.())
      .catch(() => null)
      .then((answer) => live && setList(answer?.ok ? answer.contacts : []));
    return () => {
      live = false;
    };
  }, [api]);
  return list;
};

const PickList = ({ api, picked, setPicked, t }) => {
  const list = useContacts(api);
  const [query, setQuery] = useState('');
  const shown = filterContacts(list, query);
  return [
    el('input', {
      key: 'q',
      type: 'search',
      className: 'share-search',
      'data-field': 'contact-search',
      placeholder: t('chat.share.search'),
      'aria-label': t('chat.share.search'),
      value: query,
      onChange: (e) => setQuery(e.target.value),
    }),
    el(
      'ul',
      { key: 'l', className: 'share-contacts' },
      list === null
        ? el('li', { className: 'meta' }, t('chat.share.loading'))
        : shown.map((contact) =>
            el(ContactRow, {
              key: contact.id,
              contact,
              picked: picked === contact.id,
              onPick: setPicked,
            })
          )
    ),
    list && shown.length === 0
      ? el(
          'p',
          { key: 'none', className: 'schedule-hint' },
          t('chat.share.noContacts')
        )
      : null,
  ];
};

const TypedFields = ({ form, set, t }) => [
  el(Field, {
    key: 'fn',
    name: 'first',
    label: t('chat.share.firstName'),
    value: form.firstName,
    maxLength: 64,
    onChange: (firstName) => set({ firstName }),
  }),
  el(Field, {
    key: 'ln',
    name: 'last',
    label: t('chat.share.lastName'),
    value: form.lastName,
    maxLength: 64,
    onChange: (lastName) => set({ lastName }),
  }),
  el(Field, {
    key: 'ph',
    name: 'phone',
    label: t('chat.share.phone'),
    value: form.phone,
    inputMode: 'tel',
    onChange: (phone) => set({ phone }),
  }),
];

/** "Contact": pick one of the account's contacts, or type a card. */
export const ContactDialog = ({ share, api }) => {
  const t = useT();
  const [tab, setTab] = useState('pick');
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '' });
  useEsc(share.close);
  const typed = typedContactBody(form);
  const body = tab === 'pick' ? picked && { contact: picked } : typed;
  const tabButton = (name, label) =>
    el(
      'button',
      {
        key: name,
        type: 'button',
        className: `share-tab${tab === name ? ' is-active' : ''}`,
        'data-tab': name,
        'aria-pressed': tab === name,
        onClick: () => setTab(name),
      },
      label
    );
  return el(
    Shell,
    { title: t('chat.share.contactTitle'), name: 'share-contact' },
    [
      el('div', { key: 'tabs', className: 'share-tabs' }, [
        tabButton('pick', t('chat.share.tabPick')),
        tabButton('typed', t('chat.share.tabTyped')),
      ]),
      ...(tab === 'pick'
        ? [el(PickList, { key: 'pick', api, picked, setPicked, t })]
        : TypedFields({
            form,
            set: (c) => setForm((now) => ({ ...now, ...c })),
            t,
          })),
      share.failure
        ? el(
            'p',
            {
              key: 'e',
              className: 'schedule-hint',
              role: 'alert',
              'data-share': 'failure',
            },
            shareErrorText(t, share.failure)
          )
        : null,
      el('div', { key: 'btns', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'ok',
            type: 'button',
            className: 'primary',
            'data-action': 'contact-send',
            disabled: !body || share.sending,
            onClick: () => body && share.sendContact(body),
          },
          t('chat.share.sendContact')
        ),
        el(
          'button',
          { key: 'cancel', type: 'button', onClick: share.close },
          t('common.cancel')
        ),
      ]),
    ]
  );
};

/** Whichever dialog is open, or nothing. */
export const ShareDialog = ({ share, api }) =>
  share.shown === 'location'
    ? el(LocationDialog, { share, api })
    : share.shown === 'contact'
      ? el(ContactDialog, { share, api })
      : null;
