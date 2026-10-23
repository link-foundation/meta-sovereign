// Map pictures of places (R-Y131): read in chunks, kept, Telegram's errors
// as codes, the route's strict checks. Fake clients; nothing reaches a
// network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMapActions, mapQuery } from '../src/sources/telegram-map.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { parseMedia } from '../src/web/message-parts.js';

const geoPlace = (geo) =>
  parseMedia({
    media: { className: 'MessageMediaGeo', geo: { lat: 1, long: 2, ...geo } },
  });

// A request class: its fields, and its name as `className`.
const named = (className) =>
  function Request(fields) {
    return Object.assign(this, fields, { className });
  };

const Api = {
  InputGeoPoint: named('InputGeoPoint'),
  InputWebFileGeoPointLocation: named('InputWebFileGeoPointLocation'),
  upload: { GetWebFile: named('GetWebFile') },
};
const helpers = { returnBigInt: (v) => BigInt(v) };

const CHUNK = 128 * 1024;

// A client holding `total` bytes, answering a chunk at a time.
const make = (total, { fail } = {}) => {
  const log = [];
  const picture = Buffer.alloc(total, 7);
  const client = {
    invoke: async (request) => {
      log.push(request);
      const { offset, limit } = request;
      if (fail) {
        throw Object.assign(new Error(fail), { errorMessage: fail });
      }
      return {
        bytes: picture.subarray(offset, offset + limit),
        mimeType: 'image/png',
        size: total,
      };
    },
  };
  const actions = createMapActions(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => client }
  );
  return { actions, log };
};

const SHOT = { lat: 55.75, lon: 37.62, w: 300, h: 150, zoom: 15, scale: 2 };

test('the picture is read in 128 KiB chunks until the bytes run out', async () => {
  const { actions, log } = make(CHUNK * 2 + 10);
  const map = await actions.mapImage({ ...SHOT, accessHash: '-42' });
  assert.equal(map.ok, true);
  assert.equal(map.mime, 'image/png');
  assert.equal(map.bytes.length, CHUNK * 2 + 10);
  assert.deepEqual(
    log.map((r) => [r.offset, r.limit]),
    [
      [0, CHUNK],
      [CHUNK, CHUNK],
      [CHUNK * 2, CHUNK],
    ]
  );
  const location = log[0].location;
  assert.equal(location.className, 'InputWebFileGeoPointLocation');
  assert.deepEqual(
    [location.w, location.h, location.zoom, location.scale],
    [300, 150, 15, 2]
  );
  assert.equal(location.accessHash, -42n);
  assert.deepEqual(
    [location.geoPoint.lat, location.geoPoint.long],
    [55.75, 37.62]
  );
});

test('a whole chunk at the end asks no more once the size is reached', async () => {
  const { actions, log } = make(CHUNK);
  assert.equal((await actions.mapImage(SHOT)).bytes.length, CHUNK);
  assert.equal(log.length, 1);
  assert.equal(log[0].location.accessHash, 0n);
});

test('a map seen again comes from memory; about 64 are kept', async () => {
  const { actions, log } = make(100);
  await actions.mapImage(SHOT);
  await actions.mapImage(SHOT);
  assert.equal(log.length, 1);
  for (let i = 0; i < 70; i++) {
    await actions.mapImage({ ...SHOT, lat: i });
  }
  const before = log.length;
  await actions.mapImage(SHOT);
  assert.equal(log.length, before + 1, 'the first one was let go');
  await actions.mapImage({ ...SHOT, lat: 69 });
  assert.equal(log.length, before + 1, 'a recent one is still kept');
});

test('Telegram errors become codes, and are not kept', async () => {
  const gone = make(1, { fail: 'WEBFILE_NOT_AVAILABLE' });
  const answer = await gone.actions.mapImage(SHOT);
  assert.deepEqual([answer.ok, answer.code], [false, 'map-unavailable']);
  await gone.actions.mapImage(SHOT);
  assert.equal(gone.log.length, 2, 'a failure is asked again');
  const other = make(1, { fail: 'SOMETHING_ELSE' });
  assert.equal((await other.actions.mapImage(SHOT)).code, 'failed');
});

test('no connected account is not an error of Telegram', async () => {
  const actions = createMapActions(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  assert.deepEqual(await actions.mapImage(SHOT), {
    ok: false,
    supported: false,
  });
});

const query = (obj) => new URLSearchParams(obj);
const GOOD = {
  lat: '55.75',
  lon: '37.62',
  w: '300',
  h: '150',
  zoom: '15',
  scale: '2',
};

test('the query is checked strictly', () => {
  assert.deepEqual(mapQuery(query(GOOD)), {
    lat: 55.75,
    lon: 37.62,
    w: 300,
    h: 150,
    zoom: 15,
    scale: 2,
  });
  assert.equal(mapQuery(query({ ...GOOD, hash: '-123' })).accessHash, '-123');
  for (const bad of [
    { lat: '91' },
    { lat: '-90.5' },
    { lon: '181' },
    { lat: 'x' },
    { lat: '' },
    { w: '15' },
    { w: '1025' },
    { h: '150.5' },
    { zoom: '12' },
    { zoom: '21' },
    { scale: '0' },
    { scale: '4' },
    { hash: '12a' },
    { hash: '--1' },
  ]) {
    assert.equal(
      mapQuery(query({ ...GOOD, ...bad })),
      null,
      JSON.stringify(bad)
    );
  }
  assert.equal(mapQuery(query({ lat: '1', lon: '1' })), null);
});

const get = async (search, account) => {
  const path = '/api/telegram/map';
  const req = { method: 'GET', url: `${path}?${search}`, headers: {} };
  const res = {
    setHeader() {},
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return res;
};

test('the route answers the bytes for a day, and 400 for a bad query', async () => {
  const asked = [];
  const account = {
    mapImage: async (args) => {
      asked.push(args);
      return { ok: true, mime: 'image/png', bytes: Buffer.from('png') };
    },
  };
  const ok = await get(
    new URLSearchParams({ ...GOOD, hash: '5' }).toString(),
    account
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['content-type'], 'image/png');
  assert.equal(ok.headers['cache-control'], 'private, max-age=86400');
  assert.equal(ok.body.toString(), 'png');
  assert.equal(asked[0].accessHash, '5');
  const bad = await get(
    new URLSearchParams({ ...GOOD, zoom: '3' }).toString(),
    account
  );
  assert.equal(bad.status, 400);
  assert.equal(asked.length, 1, 'a bad query asks nothing');
  const none = await get(new URLSearchParams(GOOD).toString(), {
    mapImage: async () => ({ ok: false, code: 'map-unavailable' }),
  });
  assert.equal(none.status, 404);
});

test('a place keeps its access hash for the map', () => {
  assert.equal(geoPlace({ accessHash: { value: 99n } }).hash, '99');
  assert.equal(geoPlace({ accessHash: '-7' }).hash, '-7');
  assert.equal(geoPlace({}).hash, undefined);
});
