// Following our live location (R-Y147): when an update is due (at least 30 s
// later and the point moved), the browser's position as a body, the places
// still followed (not ended, not stopped). Pure helpers; no browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVE_UPDATE_MS,
  distanceMeters,
  followedLive,
  liveEnd,
  markLiveStopped,
  onLiveStopped,
  positionBody,
  shouldUpdateLive,
} from '../src/web/live-follow.js';

test('an update is due only 30 s later and when the point moved', () => {
  const last = { at: 1_000_000, lat: 50, lon: 10 };
  const far = { lat: 50.001, lon: 10 };
  assert.equal(
    shouldUpdateLive(last, far, last.at + LIVE_UPDATE_MS - 1),
    false
  );
  assert.equal(shouldUpdateLive(last, far, last.at + LIVE_UPDATE_MS), true);
  const same = { lat: 50, lon: 10.000001 };
  assert.equal(
    shouldUpdateLive(last, same, last.at + 10 * LIVE_UPDATE_MS),
    false
  );
  assert.equal(shouldUpdateLive(null, far, 5), true);
  assert.equal(shouldUpdateLive(last, null, last.at + 99_999), false);
});

test('distance is in metres', () => {
  const d = distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0.001 });
  assert.ok(d > 110 && d < 112, String(d));
  assert.equal(distanceMeters({ lat: 5, lon: 5 }, { lat: 5, lon: 5 }), 0);
});

test('the position becomes a body with accuracy and heading', () => {
  assert.deepEqual(
    positionBody({
      coords: { latitude: 1, longitude: 2, accuracy: 20.4, heading: 89.6 },
    }),
    { lat: 1, lon: 2, accuracy: 20, heading: 90 }
  );
  assert.deepEqual(
    positionBody({
      coords: { latitude: 1, longitude: 2, accuracy: 9000, heading: null },
    }),
    { lat: 1, lon: 2, accuracy: 1500 }
  );
  assert.equal(positionBody({ coords: { latitude: NaN, longitude: 2 } }), null);
  assert.equal(positionBody(null), null);
});

test('only our live places that are neither over nor stopped are followed', () => {
  const now = 1_000_000;
  const live = (id, extra = {}) => ({
    id,
    source: 'telegram',
    raw: {
      out: true,
      date: now - 100,
      media: {
        className: 'MessageMediaGeoLive',
        period: 900,
        geo: { lat: 1, long: 2 },
      },
      ...extra,
    },
  });
  const a = live('a');
  const over = live('over', { date: now - 5000 });
  const theirs = live('theirs', { out: false });
  const b = live('b');
  assert.deepEqual(
    followedLive([a, over, theirs, b], now).map((m) => m.id),
    ['a', 'b']
  );
  assert.equal(liveEnd(a), now - 100 + 900);
  let told = 0;
  const off = onLiveStopped(() => (told += 1));
  markLiveStopped(b);
  off();
  markLiveStopped(a);
  assert.equal(told, 1);
  assert.deepEqual(followedLive([a, b], now), []);
});
