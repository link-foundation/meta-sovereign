// The live locations of a chat, as Telegram Desktop shows them (R-Y197;
// learned, never copied): while any live place shared in the open chat is
// active a "Live locations" bar sits at the top of it. It opens a panel
// listing everyone sharing — a small map, the name and the time left —
// and a click goes to that message. For the user's own share the bar has
// "Stop sharing" (asked first) and the panel "Notify when nearby", which
// edits the live place with a proximity radius. Each write is one click.

import React, { useEffect, useState } from 'react';
import { useT } from './i18n.js';
import { Icon } from './icons.js';
import { Frame } from './chat-readers.js';
import { useEsc } from './chat-invite.js';
import { MAP_SHOT, useMapUrl } from './chat-media.js';
import { mediaSrc } from './media-src.js';
import { networkMessageId } from './chat-model.js';
import {
  isLiveStopped,
  markLiveStopped,
  onLiveStopped,
} from './live-follow.js';
import { useNowSeconds } from './live-clock.js';
import {
  activeShares,
  headingDegrees,
  leftLine,
  liveLines,
} from './live-place.js';

const el = React.createElement;

/** `{ shares, now }` of the open chat, kept current by the clock and by stops. */
export const useLiveShares = (state) => {
  const [, tick] = useState(0);
  useEffect(() => onLiveStopped(() => tick((n) => n + 1)), []);
  const shown = state.current?.source === 'telegram';
  const now = useNowSeconds(shown);
  return {
    now,
    shares: activeShares(shown ? state.messages : null, now, isLiveStopped),
  };
};

// The place's own words: "until" is the share's end, in the shapes the
// map lines of the bubble use.
const mediaOf = (share) => ({ ...share, live: true });

const Small = ({ api, share }) => {
  const url = useMapUrl(api, share, false);
  return el('span', { className: 'live-share-map' }, [
    url
      ? el('img', {
          key: 'i',
          ...mediaSrc(url),
          alt: '',
          width: MAP_SHOT.w,
          height: MAP_SHOT.h,
          draggable: false,
        })
      : null,
    el('svg', { key: 'p', className: 'live-share-pin', viewBox: '0 0 24 32' }, [
      el('path', {
        key: 'a',
        d: 'M12 1C6 1 1.5 5.6 1.5 11.4 1.5 19 12 31 12 31s10.5-12 10.5-19.6C22.5 5.6 18 1 12 1z',
      }),
    ]),
  ]);
};

// "Notify when nearby": a radius in metres, set on a click.
const Nearby = ({ share, onSet, t }) => {
  const [open, setOpen] = useState(false);
  const [metres, setMetres] = useState(String(share.radius || 100));
  const radius = Number(metres);
  const ok = Number.isInteger(radius) && radius > 0 && radius <= 100_000;
  return open
    ? el('span', { className: 'live-nearby', 'data-live': 'nearby-form' }, [
        el('input', {
          key: 'r',
          type: 'number',
          min: 1,
          max: 100_000,
          value: metres,
          'aria-label': t('chat.live.nearbyRadius'),
          'data-field': 'proximity',
          onChange: (e) => setMetres(e.target.value),
        }),
        el(
          'button',
          {
            key: 's',
            type: 'button',
            className: 'primary',
            disabled: !ok,
            'data-action': 'live-nearby-set',
            onClick: () => {
              setOpen(false);
              onSet(share, radius);
            },
          },
          t('chat.live.nearbySet')
        ),
      ])
    : el(
        'button',
        {
          type: 'button',
          className: 'ghost live-nearby-open',
          'data-action': 'live-nearby',
          onClick: () => setOpen(true),
        },
        share.radius
          ? t('chat.live.nearbyOn', { count: share.radius })
          : t('chat.live.nearby')
      );
};

const Row = ({ api, share, now, t, onGo, onNearby }) => {
  const lines = [
    share.own ? t('chat.live.you') : share.name || t('chat.saved.unknown'),
  ];
  const media = mediaOf(share);
  const meta = [
    leftLine(t, media, now),
    ...liveLines(t, media, now).slice(0, 1),
  ];
  const heading = headingDegrees(share);
  return el(
    'li',
    {
      className: 'live-share',
      'data-live-share': share.id,
      'data-live-own': share.own ? 'true' : 'false',
    },
    [
      el(
        'button',
        {
          key: 'go',
          type: 'button',
          className: 'live-share-go',
          'data-action': 'live-go',
          onClick: () => onGo(share),
        },
        [
          el(Small, { key: 'm', api, share }),
          el('span', { key: 't', className: 'live-share-text' }, [
            el('strong', { key: 'n' }, lines[0]),
            ...meta
              .filter(Boolean)
              .map((line, i) =>
                el('span', { key: i, className: 'meta live-share-meta' }, line)
              ),
            heading === null
              ? null
              : el('span', { key: 'h', className: 'meta' }, `${heading}°`),
          ]),
        ]
      ),
      share.own ? el(Nearby, { key: 'near', share, onSet: onNearby, t }) : null,
    ]
  );
};

const Panel = ({ api, shares, now, close, onGo, onNearby }) => {
  const t = useT();
  return el(
    Frame,
    { title: t('chat.live.title'), close, name: 'live-locations' },
    el(
      'ul',
      { className: 'live-shares' },
      shares.map((share) =>
        el(Row, { key: share.who, api, share, now, t, onGo, onNearby })
      )
    )
  );
};

const ConfirmStop = ({ onYes, onNo }) => {
  const t = useT();
  useEsc(onNo);
  return el(
    'div',
    {
      className: 'delete-dialog-overlay',
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-label': t('chat.live.stopTitle'),
      'data-live': 'stop-confirm',
    },
    el('div', { className: 'delete-dialog' }, [
      el('h3', { key: 'h' }, t('chat.live.stopTitle')),
      el('p', { key: 'p' }, t('chat.live.stopAsk')),
      el('div', { key: 'b', className: 'delete-dialog-btns' }, [
        el(
          'button',
          {
            key: 'y',
            type: 'button',
            className: 'danger',
            'data-action': 'live-stop-yes',
            onClick: onYes,
          },
          t('chat.live.stop')
        ),
        el(
          'button',
          {
            key: 'n',
            type: 'button',
            'data-action': 'live-stop-no',
            onClick: onNo,
          },
          t('common.cancel')
        ),
      ]),
    ])
  );
};

/** The bar, the panel and the confirmation of the open chat's live places. */
export const LiveLocationsBar = ({ state, api, onGo }) => {
  const t = useT();
  const { shares, now } = useLiveShares(state);
  const [view, setView] = useState(null); // 'panel' | 'stop'
  const chat = state.current?.chat ? String(state.current.chat) : null;
  useEffect(() => {
    if (shares.length === 0) {
      setView(null);
    }
  }, [shares.length]);
  if (shares.length === 0 || !chat) {
    return null;
  }
  const own = shares.filter((s) => s.own);
  const messageOf = (share) =>
    (state.messages ?? []).find((m) => m.id === share.id);
  const stop = async () => {
    setView(null);
    for (const share of own) {
      const message = messageOf(share);
      if (message && typeof api?.telegramStopLive === 'function') {
        markLiveStopped(message);
        await Promise.resolve(
          api.telegramStopLive({ chat, id: networkMessageId(message) })
        ).catch(() => null);
      }
    }
  };
  const nearby = async (share, radius) => {
    const message = messageOf(share);
    if (message && typeof api?.telegramUpdateLive === 'function') {
      await Promise.resolve(
        api.telegramUpdateLive({
          chat,
          id: networkMessageId(message),
          lat: share.lat,
          lon: share.lon,
          proximity: radius,
        })
      ).catch(() => null);
    }
  };
  const go = (share) => {
    setView(null);
    onGo?.(share.id);
  };
  const sub =
    shares.length > 1
      ? t('chat.live.countOthers', { count: shares.length })
      : t(own.length > 0 ? 'chat.live.sharingYou' : 'chat.live.sharingOthers');
  return el(React.Fragment, null, [
    el('div', { key: 'bar', className: 'live-bar', 'data-live': 'bar' }, [
      el(
        'button',
        {
          key: 'open',
          type: 'button',
          className: 'live-bar-main',
          'data-action': 'live-open',
          'aria-label': t('chat.live.open'),
          title: t('chat.live.open'),
          onClick: () => setView('panel'),
        },
        [
          el(Icon, { key: 'i', name: 'map-pin', size: 18 }),
          el('span', { key: 't', className: 'live-bar-text' }, [
            el('strong', { key: 'a' }, t('chat.live.title')),
            el('span', { key: 'b', className: 'live-bar-sub' }, sub),
          ]),
        ]
      ),
      own.length > 0
        ? el(
            'button',
            {
              key: 'stop',
              type: 'button',
              className: 'ghost live-bar-stop',
              'data-action': 'live-stop',
              onClick: () => setView('stop'),
            },
            t('chat.live.stop')
          )
        : null,
    ]),
    view === 'panel'
      ? el(Panel, {
          key: 'panel',
          api,
          shares,
          now,
          close: () => setView(null),
          onGo: go,
          onNearby: nearby,
        })
      : null,
    view === 'stop'
      ? el(ConfirmStop, { key: 'stop', onYes: stop, onNo: () => setView(null) })
      : null,
  ]);
};
