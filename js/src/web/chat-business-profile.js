// What a business shows on its profile and in an empty chat with it
// (R-Y180; learned from Telegram Desktop, never copied): "Open now" or
// "Closed" with today's hours and, on a click, the whole week, in the
// business's time zone or the viewer's; the address with a map picture
// that opens the map; and its intro (title, description, sticker) in place
// of the plain empty state. Read from `business-profile`, kept a minute.

import React, { useEffect, useState } from 'react';
import { useLocaleContext } from './i18n.js';
import { Picture } from './chat-stickers.js';
import { mapLink, useMapUrl } from './chat-media.js';
import { mediaSrc } from './media-src.js';
import {
  allDay,
  dayNames,
  hoursIn,
  isOpen,
  myZone,
  rangesText,
  toDays,
  weekday,
} from './business-hours-model.js';

const el = React.createElement;

const KEEP_MS = 60_000;
const kept = new Map(); // chat -> { at, answer }

/** Forgets what was read (the tests'). */
export const forgetBusiness = () => kept.clear();

/**
 * A person's business data, `{ hours, location, intro }`, or null until
 * (or unless) the server has some. `now` is the clock the cache uses.
 */
export const useBusinessProfile = (api, chat, now = () => Date.now()) => {
  const id = chat?.source === 'telegram' ? String(chat.chat) : '';
  const wanted =
    /^\d+$/.test(id) && typeof api?.telegramBusinessProfile === 'function';
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    setAnswer(null);
    if (!wanted) {
      return undefined;
    }
    const hit = kept.get(id);
    if (hit && now() - hit.at < KEEP_MS) {
      setAnswer(hit.answer);
      return undefined;
    }
    let live = true;
    api
      .telegramBusinessProfile({ chat: id })
      .then((next) => {
        if (next?.ok) {
          kept.set(id, { at: now(), answer: next });
          if (live) {
            setAnswer(next);
          }
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, id, wanted]);
  return answer;
};

/**
 * The lines of the hours' summary for `hours` at `now` seen in `viewZone`:
 * `{ open, today, week }` with `today` text ('' closed) and `all` when
 * open all day; `week` the seven days' text, Monday first.
 */
export const hoursView = (hours, viewZone, now) => {
  const weekly = hoursIn(hours.weekly, hours.timezone, viewZone, now);
  const days = toDays(weekly);
  const index = weekday(viewZone, now);
  return {
    open: isOpen(hours.weekly, hours.timezone, now),
    todayIndex: index,
    week: days.map((ranges) => ({
      all: allDay(ranges),
      text: rangesText(ranges),
    })),
  };
};

const dayText = (t, day) =>
  day.all
    ? t('chat.business.hours.allDay')
    : day.text || t('chat.business.hours.closed');

const HoursBlock = ({ hours }) => {
  const { t, locale } = useLocaleContext();
  const [week, setWeek] = useState(false);
  const mine = myZone();
  const [theirs, setTheirs] = useState(true);
  const differs = hours.timezone !== mine;
  const zone = theirs || !differs ? hours.timezone : mine;
  const view = hoursView(hours, zone, Date.now());
  const names = dayNames(locale);
  return el('div', { className: 'business-hours', 'data-business': 'hours' }, [
    el(
      'button',
      {
        key: 'b',
        type: 'button',
        className: 'business-hours-line',
        'aria-expanded': week,
        'data-action': 'hours-toggle',
        onClick: () => setWeek(!week),
      },
      [
        el(
          'strong',
          {
            key: 's',
            className: view.open ? 'business-open' : 'business-closed',
            'data-field': 'open-state',
          },
          t(view.open ? 'chat.business.open' : 'chat.business.closed')
        ),
        el(
          'span',
          { key: 't', className: 'meta', 'data-field': 'today' },
          ` ${dayText(t, view.week[view.todayIndex])}`
        ),
      ]
    ),
    week
      ? el(
          'ul',
          { key: 'w', className: 'business-week', 'data-field': 'week' },
          [
            ...view.week.map((day, i) =>
              el(
                'li',
                {
                  key: i,
                  className: i === view.todayIndex ? 'is-today' : undefined,
                },
                [
                  el('span', { key: 'n' }, names[i]),
                  el('span', { key: 't', className: 'meta' }, dayText(t, day)),
                ]
              )
            ),
            differs
              ? el(
                  'li',
                  { key: 'z', className: 'business-zone' },
                  el(
                    'button',
                    {
                      type: 'button',
                      'data-action': 'hours-zone',
                      onClick: () => setTheirs(!theirs),
                    },
                    t(
                      theirs
                        ? 'chat.business.hours.myZone'
                        : 'chat.business.hours.theirZone'
                    )
                  )
                )
              : null,
          ]
        )
      : null,
  ]);
};

const PlaceBlock = ({ api, location }) => {
  const { point } = location;
  const url = useMapUrl(api, point ?? { lat: 0, lon: 0 }, !point);
  const lines = el('span', { key: 'l', className: 'place-lines' }, [
    el('span', { key: 'a' }, location.address),
  ]);
  return point
    ? el(
        'a',
        {
          className: 'bubble-place business-place',
          'data-business': 'location',
          href: mapLink(point.lat, point.lon),
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        [
          el('span', { key: 'm', className: 'place-map' }, [
            url ? el('img', { key: 'i', ...mediaSrc(url), alt: '' }) : null,
          ]),
          lines,
        ]
      )
    : el(
        'p',
        { className: 'business-place', 'data-business': 'location' },
        location.address
      );
};

/** The business's hours and address, in the profile column. */
export const BusinessProfile = ({ api, chat }) => {
  const data = useBusinessProfile(api, chat);
  if (!data || (!data.hours && !data.location)) {
    return null;
  }
  return el('div', { className: 'business-profile' }, [
    data.hours && data.hours.weekly.length > 0
      ? el(HoursBlock, { key: 'h', hours: data.hours })
      : null,
    data.location
      ? el(PlaceBlock, { key: 'l', api, location: data.location })
      : null,
  ]);
};

/**
 * What an empty chat with a business shows, its intro; the plain "no
 * messages" line stays when it has none.
 */
export const BusinessIntro = ({ api, chat, fallback }) => {
  const data = useBusinessProfile(api, chat);
  const intro = data?.intro;
  if (!intro || (!intro.title && !intro.description && !intro.sticker)) {
    return fallback;
  }
  return el('div', { className: 'business-intro', 'data-business': 'intro' }, [
    intro.sticker
      ? el(
          'span',
          { key: 's', className: 'business-intro-sticker' },
          el(Picture, { api, item: intro.sticker })
        )
      : null,
    intro.title ? el('strong', { key: 't' }, intro.title) : null,
    intro.description
      ? el('p', { key: 'd', className: 'meta' }, intro.description)
      : null,
  ]);
};
