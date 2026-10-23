// Our live location follows us (R-Y147; learned, never copied): while a
// live place this user sent in the open chat is still shared (its period
// has not ended, it was not stopped) the page watches the browser's
// position and sends the new point with its heading, no more often than
// every 30 s and only when it moved. It stops watching when the period
// ends, on "Stop sharing" and when the page closes.

import { useEffect, useRef, useState } from 'react';
import { networkMessageId } from './chat-model.js';
import {
  followedLive,
  liveEnd,
  onLiveStopped,
  positionBody,
  shouldUpdateLive,
} from './live-follow.js';

const lastOf = (message) => ({
  at: (Number(message.raw.editDate) || Number(message.raw.date) || 0) * 1000,
  lat: Number(message.raw.media.geo.lat),
  lon: Number(message.raw.media.geo.long),
});

// Sends the point for each followed message that is due.
const follow = async ({ api, chat, followed, sent, position }) => {
  const body = positionBody(position);
  const now = Date.now();
  for (const message of followed) {
    const last = sent.get(message.id) ?? lastOf(message);
    if (body && shouldUpdateLive(last, body, now)) {
      sent.set(message.id, { at: now, lat: body.lat, lon: body.lon });
      await Promise.resolve(
        api.telegramUpdateLive({
          chat,
          id: networkMessageId(message),
          ...body,
        })
      ).catch(() => null);
    }
  }
};

/** Watches the position while an own live place of `state.current` lives. */
export const useLiveWatch = ({ api, state }) => {
  const [tick, setTick] = useState(0);
  const sent = useRef(new Map()); // message id -> { at, lat, lon }
  const chat = state.current?.chat ? String(state.current.chat) : null;
  const can =
    typeof api?.telegramUpdateLive === 'function' &&
    typeof globalThis.navigator?.geolocation?.watchPosition === 'function';
  const followed =
    can && chat ? followedLive(state.messages, Date.now() / 1000) : [];
  const key = followed.map((m) => m.id).join('|');
  const latest = useRef(followed);
  latest.current = followed;
  useEffect(() => onLiveStopped(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    if (followed.length === 0) {
      return undefined;
    }
    // Let go when the first period ends.
    const ends = followed.map(liveEnd).filter(Boolean);
    const timer = ends.length
      ? globalThis.setTimeout(
          () => setTick((n) => n + 1),
          Math.max(1000, (Math.min(...ends) - Date.now() / 1000) * 1000 + 500)
        )
      : null;
    const geo = globalThis.navigator.geolocation;
    const id = geo.watchPosition(
      (position) =>
        follow({
          api,
          chat,
          followed: followedLive(latest.current, Date.now() / 1000),
          sent: sent.current,
          position,
        }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 }
    );
    const close = () => geo.clearWatch(id);
    globalThis.addEventListener?.('pagehide', close);
    return () => {
      globalThis.removeEventListener?.('pagehide', close);
      globalThis.clearTimeout(timer);
      close();
    };
  }, [key, chat, tick, can]);
};
