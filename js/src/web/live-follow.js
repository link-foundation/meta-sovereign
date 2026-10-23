// Following our live location as we move (R-Y147; learned, never copied):
// the pure parts — when an update is due, the browser's position as a
// request body, and which live places are still followed.

import { canStopLive } from './live-place.js';

/** No more often than this (ms), as Telegram Desktop paces its updates. */
export const LIVE_UPDATE_MS = 30_000;
/** A smaller step than this (metres) is the same place. */
export const LIVE_MOVED_M = 3;

const EARTH_M = 6_371_000;
const radians = (degrees) => (degrees * Math.PI) / 180;

/** Metres between two `{ lat, lon }` points (haversine). */
export const distanceMeters = (a, b) => {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Whether `point` should be sent as the live place's new position:
 * `last` is `{ at (ms), lat, lon }` of the last one sent; true when it is
 * at least `LIVE_UPDATE_MS` later and the point moved.
 */
export const shouldUpdateLive = (last, point, now) =>
  Boolean(point) &&
  (!last ||
    (now - last.at >= LIVE_UPDATE_MS &&
      distanceMeters(last, point) >= LIVE_MOVED_M));

/** The browser's position as a request body part, or null. */
export const positionBody = (position) => {
  const { latitude, longitude, accuracy, heading } = position?.coords ?? {};
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const radius = Math.round(accuracy);
  return {
    lat: latitude,
    lon: longitude,
    ...(radius > 0 ? { accuracy: Math.min(radius, 1500) } : {}),
    ...(Number.isFinite(heading) ? { heading: Math.round(heading) } : {}),
  };
};

/** When the live place ends (seconds), 0 when it has no end. */
export const liveEnd = (message) =>
  (Number(message?.raw?.media?.period) || 0) > 0
    ? (Number(message.raw.date) || 0) + Number(message.raw.media.period)
    : 0;

// Messages stopped here: they are no longer followed.
const stoppedKeys = new Set();
const listeners = new Set();

/** Remember `message` as stopped; the watcher lets go of it. */
export const markLiveStopped = (message) => {
  stoppedKeys.add(message.id);
  listeners.forEach((fn) => fn());
};

/** Whether `message` was stopped here (R-Y197). */
export const isLiveStopped = (message) => stoppedKeys.has(message.id);

/** Calls `fn` when a live place is stopped; returns the way to stop that. */
export const onLiveStopped = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Our own live places still shared at `now` (seconds). */
export const followedLive = (messages, now) =>
  (messages ?? []).filter(
    (m) => canStopLive(m, now) && !stoppedKeys.has(m.id) && m.raw?.media?.geo
  );
