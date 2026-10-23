// A business's location and intro, as Telegram Desktop's Business settings
// edit them (R-Y180; learned, never copied). Location: an address and,
// optionally, a point on the map (typed, or this device's position) with
// the map's picture. Intro: a title, a description and a sticker, shown in
// an empty chat with the business. Nothing is sent until Save.

import React, { useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { Field, FormDialog } from './chat-create.js';
import { Picture } from './chat-stickers.js';
import { mapLink, useMapUrl } from './chat-media.js';
import { mediaSrc } from './media-src.js';
import {
  errorText,
  useBusinessRead,
  useSaving,
} from './chat-business-common.js';

const el = React.createElement;

export const ADDRESS_MAX = 96;
export const TITLE_MAX = 32;
export const DESCRIPTION_MAX = 70;

/** A typed coordinate as a number inside `limit`, or null. */
export const coordinate = (value, limit) => {
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  const number = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
};

/**
 * The body of business-location-set for the typed fields, or `{ code }`
 * when they cannot be sent: a point needs both numbers and an address.
 */
export const locationRequest = ({ address, lat, lon }) => {
  const text = address.trim();
  const blank = lat.trim() === '' && lon.trim() === '';
  if (Array.from(text).length > ADDRESS_MAX) {
    return { code: 'address-long' };
  }
  if (blank) {
    return { body: { address: text } };
  }
  const point = { lat: coordinate(lat, 90), lon: coordinate(lon, 180) };
  if (point.lat === null || point.lon === null) {
    return { code: 'point-invalid' };
  }
  return text === ''
    ? { code: 'address-empty' }
    : { body: { address: text, ...point } };
};

const askPosition = () =>
  new Promise((resolve) => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo?.getCurrentPosition) {
      resolve(null);
      return;
    }
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10_000, maximumAge: 60_000 }
    );
  });

const PlacePreview = ({ api, point }) => {
  const url = useMapUrl(api, point, !point);
  return point
    ? el(
        'a',
        {
          className: 'bubble-place business-place-preview',
          'data-place-map': '',
          href: mapLink(point.lat, point.lon),
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        el('span', { className: 'place-map' }, [
          url ? el('img', { key: 'i', ...mediaSrc(url), alt: '' }) : null,
        ])
      )
    : null;
};

const LocationForm = ({ api, t, close, location }) => {
  const [form, setForm] = useState({
    address: location?.address ?? '',
    lat: location?.point ? String(location.point.lat) : '',
    lon: location?.point ? String(location.point.lon) : '',
  });
  const saving = useSaving(t, close);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const submit = () => {
    const { body, code } = locationRequest(form);
    if (code) {
      saving.fail(code);
    } else {
      saving.save(() => api.telegramBusinessLocationSet(body));
    }
  };
  const lat = coordinate(form.lat, 90);
  const lon = coordinate(form.lon, 180);
  return el(
    FormDialog,
    {
      name: 'business-location',
      title: t('chat.business.location'),
      onClose: close,
      onSubmit: submit,
      submit: t('chat.business.save'),
      busy: saving.busy,
      error: saving.error,
      outside: true,
    },
    [
      el(Field, {
        key: 'a',
        label: t('chat.business.location.address'),
        name: 'address',
        value: form.address,
        maxLength: ADDRESS_MAX,
        autoFocus: true,
        onChange: set('address'),
      }),
      el(Field, {
        key: 'la',
        label: t('chat.business.location.lat'),
        name: 'lat',
        value: form.lat,
        inputMode: 'decimal',
        onChange: set('lat'),
      }),
      el(Field, {
        key: 'lo',
        label: t('chat.business.location.lon'),
        name: 'lon',
        value: form.lon,
        inputMode: 'decimal',
        onChange: set('lon'),
      }),
      el(
        'button',
        {
          key: 'here',
          type: 'button',
          'data-action': 'use-position',
          onClick: async () => {
            const here = await askPosition();
            if (here) {
              setForm({
                ...form,
                lat: here.lat.toFixed(5),
                lon: here.lon.toFixed(5),
              });
            } else {
              saving.fail('position');
            }
          },
        },
        t('chat.business.location.here')
      ),
      lat !== null && lon !== null
        ? el(PlacePreview, { key: 'm', api, point: { lat, lon } })
        : null,
    ]
  );
};

/** Settings → Business → Location. */
export const LocationDialog = ({ api, close }) => {
  const { t } = useLocaleContext();
  const read = useBusinessRead(() => api.telegramBusinessLocation());
  if (read.phase === 'ready') {
    return el(LocationForm, {
      api,
      t,
      close,
      location: read.data.location,
    });
  }
  return el(
    FormDialog,
    {
      name: 'business-location',
      title: t('chat.business.location'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.create.cancel'),
      busy: false,
      error: read.phase === 'error' ? errorText(t, read.code) : null,
      outside: true,
    },
    read.phase === 'loading'
      ? el('p', { className: 'meta' }, t('chat.business.loading'))
      : null
  );
};

// The stickers to choose from, asked when the list is opened.
const StickerChoices = ({ api, t, pick }) => {
  const read = useBusinessRead(() => api.telegramBusinessIntroStickers());
  if (read.phase !== 'ready') {
    return el(
      'p',
      { className: 'meta' },
      read.phase === 'error'
        ? errorText(t, read.code)
        : t('chat.business.loading')
    );
  }
  return el(
    'div',
    { className: 'business-stickers', 'data-field': 'sticker-choices' },
    read.data.stickers.map((item) =>
      el(
        'button',
        {
          key: item.id,
          type: 'button',
          className: 'sticker-cell',
          'data-sticker': item.id,
          'aria-label': item.emoji || t('chat.stickers.sticker'),
          onClick: () => pick(item),
        },
        el(Picture, { api, item })
      )
    )
  );
};

const StickerRow = ({ api, t, sticker, setSticker }) => {
  const [choosing, setChoosing] = useState(false);
  return el('div', { className: 'business-sticker' }, [
    el(
      'span',
      { key: 'l', className: 'meta' },
      t('chat.business.intro.sticker')
    ),
    sticker
      ? el(
          'span',
          {
            key: 'p',
            className: 'business-sticker-now',
            'data-field': 'sticker',
          },
          el(Picture, { api, item: sticker })
        )
      : null,
    el(
      'button',
      {
        key: 'c',
        type: 'button',
        'data-action': 'sticker-choose',
        onClick: () => setChoosing(!choosing),
      },
      t('chat.business.intro.choose')
    ),
    sticker
      ? el(
          'button',
          {
            key: 'r',
            type: 'button',
            'data-action': 'sticker-remove',
            onClick: () => setSticker(null),
          },
          t('chat.business.intro.removeSticker')
        )
      : null,
    choosing
      ? el(StickerChoices, {
          key: 'g',
          api,
          t,
          pick: (item) => {
            setSticker(item);
            setChoosing(false);
          },
        })
      : null,
  ]);
};

const IntroForm = ({ api, t, close, intro }) => {
  const [form, setForm] = useState({
    title: intro?.title ?? '',
    description: intro?.description ?? '',
  });
  const [sticker, setSticker] = useState(intro?.sticker ?? null);
  const saving = useSaving(t, close);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  return el(
    FormDialog,
    {
      name: 'business-intro',
      title: t('chat.business.intro'),
      onClose: close,
      onSubmit: () =>
        saving.save(() =>
          api.telegramBusinessIntroSet({
            title: form.title,
            description: form.description,
            sticker: sticker ? sticker.id : null,
          })
        ),
      submit: t('chat.business.save'),
      busy: saving.busy,
      error: saving.error,
      outside: true,
    },
    [
      el('p', { key: 'h', className: 'meta' }, t('chat.business.intro.hint')),
      el(Field, {
        key: 't',
        label: t('chat.business.intro.title'),
        name: 'intro-title',
        value: form.title,
        maxLength: TITLE_MAX,
        autoFocus: true,
        onChange: set('title'),
      }),
      el(Field, {
        key: 'd',
        label: t('chat.business.intro.description'),
        name: 'intro-description',
        area: true,
        value: form.description,
        maxLength: DESCRIPTION_MAX,
        onChange: set('description'),
      }),
      el(StickerRow, { key: 's', api, t, sticker, setSticker }),
    ]
  );
};

/** Settings → Business → Start page (the intro). */
export const IntroDialog = ({ api, close }) => {
  const { t } = useLocaleContext();
  const read = useBusinessRead(() => api.telegramBusinessIntro());
  if (read.phase === 'ready') {
    return el(IntroForm, { api, t, close, intro: read.data.intro });
  }
  return el(
    FormDialog,
    {
      name: 'business-intro',
      title: t('chat.business.intro'),
      onClose: close,
      onSubmit: close,
      submit: t('chat.create.cancel'),
      busy: false,
      error: read.phase === 'error' ? errorText(t, read.code) : null,
      outside: true,
    },
    read.phase === 'loading'
      ? el('p', { className: 'meta' }, t('chat.business.loading'))
      : null
  );
};
