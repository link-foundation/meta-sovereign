// Chat backgrounds (R-Y155): a WallPaper as the page's shape, the CSS
// gradient built from its colours, the pattern SVG made safe, the module
// against a fake client (the list, the files, the one write) and the
// routes' validation. Fakes only; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  createWallpapers,
  patternSvg,
  sanitizeSvg,
  wallpaperPage,
} from '../src/sources/telegram-wallpapers.js';
import {
  backgroundVars,
  choiceOf,
  cleanChoice,
  gradientCss,
  layerKind,
  patternLook,
} from '../src/web/wallpaper-css.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { fakeClient, helpers, named, post } from './helpers/telegram-fakes.mjs';

const DOC = {
  className: 'Document',
  id: 9n,
  accessHash: 3n,
  dcId: 2,
  size: 1000,
};
const settings = (fields) => ({ className: 'WallPaperSettings', ...fields });
const image = {
  className: 'WallPaper',
  id: 11n,
  accessHash: 5n,
  slug: 'blue-sky',
  document: {
    ...DOC,
    mimeType: 'image/jpeg',
    thumbs: [{ className: 'PhotoSize', type: 'm', size: 50 }],
  },
};
const pattern = {
  className: 'WallPaper',
  id: 12n,
  accessHash: 6n,
  pattern: true,
  dark: true,
  slug: 'dots',
  document: { ...DOC, mimeType: 'application/x-tgwallpattern' },
  settings: settings({
    backgroundColor: 0x112233,
    secondBackgroundColor: 0x445566,
    rotation: 45,
    intensity: -40,
  }),
};
const colours = {
  className: 'WallPaperNoFile',
  id: 13n,
  settings: settings({
    backgroundColor: 0xff0000,
    secondBackgroundColor: 0x00ff00,
    thirdBackgroundColor: 0x0000ff,
    fourthBackgroundColor: 0xffff00,
  }),
};

test('a WallPaper becomes the page shape', () => {
  assert.deepEqual(wallpaperPage(image), {
    id: '11',
    slug: 'blue-sky',
    kind: 'image',
    dark: false,
    colors: [],
    rotation: 0,
    intensity: 0,
    blur: false,
    motion: false,
    file: true,
  });
  const page = wallpaperPage(pattern);
  assert.equal(page.kind, 'pattern');
  assert.equal(page.dark, true);
  assert.deepEqual(page.colors, ['#112233', '#445566']);
  assert.equal(page.rotation, 45);
  assert.equal(page.intensity, -40);
  const plain = wallpaperPage(colours);
  assert.equal(plain.kind, 'colors');
  assert.equal(plain.file, false);
  assert.equal(plain.slug, '');
  assert.equal(plain.colors.length, 4);
  assert.equal(wallpaperPage({ className: 'Other' }), null);
  assert.equal(wallpaperPage(null), null);
});

test('a slug that is not plain is not passed on', () => {
  assert.equal(wallpaperPage({ ...image, slug: '../x' }).slug, '');
});

test('gradients are built from the colours', () => {
  assert.equal(gradientCss([]), '');
  assert.equal(gradientCss(['#102030']), 'linear-gradient(#102030, #102030)');
  assert.equal(
    gradientCss(['#102030', '#405060'], 0),
    'linear-gradient(180deg, #102030, #405060)'
  );
  assert.equal(
    gradientCss(['#102030', '#405060'], 45),
    'linear-gradient(225deg, #102030, #405060)'
  );
  assert.equal(
    gradientCss(['#102030', '#405060'], 270),
    'linear-gradient(90deg, #102030, #405060)'
  );
  const four = gradientCss(['#111111', '#222222', '#333333', '#444444']);
  assert.equal(four.match(/radial-gradient/g).length, 4);
  assert.match(four, /linear-gradient\(#111111, #111111\)$/);
  // Anything that is not a colour is left out.
  assert.equal(gradientCss(['red; x', 'url(x)']), '');
});

test('a pattern is drawn over its colours with the intensity as opacity', () => {
  assert.deepEqual(patternLook(-40), { opacity: 0.4, invert: true });
  assert.deepEqual(patternLook(60), { opacity: 0.6, invert: false });
  const vars = backgroundVars(choiceOf(wallpaperPage(pattern)), {
    image: '/api/telegram/wallpaper?id=12',
  });
  assert.match(vars['--wp-gradient'], /^linear-gradient\(225deg/);
  assert.equal(vars['--wp-pattern'], 'url("/api/telegram/wallpaper?id=12")');
  assert.equal(vars['--wp-pattern-opacity'], '0.4');
  assert.equal(vars['--wp-pattern-invert'], '1');
  assert.equal(vars['--wp-image'], undefined);
});

test('an image, colours and a local file set their variables', () => {
  const picture = choiceOf(wallpaperPage(image));
  assert.deepEqual(backgroundVars(picture, {}), {});
  assert.deepEqual(backgroundVars(picture, { image: '/p.jpg' }), {
    '--wp-image': 'url("/p.jpg")',
  });
  const flat = choiceOf(wallpaperPage(colours));
  assert.match(backgroundVars(flat)['--wp-gradient'], /radial-gradient/);
  assert.equal(layerKind(flat), 'colors');
  const file = cleanChoice({
    kind: 'file',
    dataUrl: 'data:image/jpeg;base64,AAAA',
  });
  assert.equal(layerKind(file), 'image');
  assert.equal(
    backgroundVars(file)['--wp-image'],
    'url("data:image/jpeg;base64,AAAA")'
  );
  assert.equal(layerKind({ kind: 'none' }), 'none');
  assert.deepEqual(backgroundVars({ kind: 'none' }), {});
});

test('a stored choice that is not ours becomes none', () => {
  assert.deepEqual(cleanChoice(null), { kind: 'none' });
  assert.deepEqual(cleanChoice({ kind: 'file', dataUrl: 'javascript:1' }), {
    kind: 'none',
  });
  assert.deepEqual(
    cleanChoice({
      kind: 'telegram',
      wallpaper: { id: 'x', kind: 'image', colors: [] },
    }),
    { kind: 'none' }
  );
  assert.deepEqual(
    cleanChoice({
      kind: 'telegram',
      wallpaper: { id: '5', kind: 'colors', colors: ['url(evil)'] },
    }),
    { kind: 'none' }
  );
  assert.equal(
    cleanChoice({
      kind: 'telegram',
      wallpaper: { id: '5', kind: 'colors', colors: ['#aabbcc'] },
    }).kind,
    'telegram'
  );
});

const EVIL = `<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>
<!-- hi -->
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 10 10">
  <script>alert(document.cookie)</script>
  <script type="x"/>
  <foreignObject><div onclick="x()">hi</div></foreignObject>
  <style>@import url(http://evil.test/x.css);</style>
  <a xlink:href="javascript:alert(1)"><path d="M0 0h5v5z"/></a>
  <image href="http://evil.test/p.png"/>
  <use href="https://evil.test/a.svg#b"/>
  <use xlink:href="#ok"/>
  <animate attributeName="href" values="javascript:alert(1)"/>
  <rect width="3" height="3" style="fill:url(http://evil.test/x)" onmouseover='y()'/>
  <path id="ok" d="M1 1h2v2z" fill="#000"/>
</svg>`;

test('the sanitizer strips everything that could run or load', () => {
  const clean = sanitizeSvg(EVIL);
  assert.ok(clean.startsWith('<svg'));
  for (const bad of [
    /<script/i,
    /foreignObject/i,
    /<style/i,
    /<image/i,
    /<animate/i,
    /\son[a-z]+\s*=/i,
    /javascript:/i,
    /evil\.test/,
    /DOCTYPE/i,
    /ENTITY/i,
    /<\?xml/,
    /<a[\s>]/,
    /<!--/,
  ]) {
    assert.doesNotMatch(clean, bad);
  }
  // The drawing and the file's own references stay.
  assert.match(clean, /<path d="M0 0h5v5z"\/>/);
  assert.match(clean, /<use xlink:href="#ok"\/>/);
  assert.match(clean, /<path id="ok" d="M1 1h2v2z" fill="#000"\/>/);
  assert.equal(sanitizeSvg('<html><body>x</body></html>'), '');
});

test('a gzipped pattern is unzipped and made safe; junk is refused', () => {
  const gz = zlib.gzipSync(Buffer.from(EVIL));
  const svg = patternSvg(gz).toString();
  assert.ok(svg.startsWith('<svg'));
  assert.doesNotMatch(svg, /script/i);
  assert.equal(patternSvg(Buffer.from('not an svg')), null);
  assert.equal(patternSvg(Buffer.from([0x1f, 0x8b, 1, 2, 3])), null);
});

const Api = {
  account: {
    GetWallPapers: named('GetWallPapers'),
    GetWallPaper: named('GetWallPaper'),
  },
  messages: { SetChatWallPaper: named('SetChatWallPaper') },
  InputWallPaper: named('InputWallPaper'),
  InputWallPaperNoFile: named('InputWallPaperNoFile'),
  InputWallPaperSlug: named('InputWallPaperSlug'),
  WallPaperSettings: named('WallPaperSettings'),
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
};

const make = async (answer, downloads = {}) => {
  const log = [];
  const client = {
    ...fakeClient(answer, log),
    downloadFile: async (location) => {
      log.push(location);
      return downloads[location.thumbSize || 'full'] ?? Buffer.alloc(0);
    },
  };
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ms-wall-'));
  const actions = createWallpapers(
    {
      importer: async () => ({ Api, helpers }),
      connection: {
        withPeer: async (_c, chat, use) => use({ chat, peerId: BigInt(chat) }),
      },
    },
    { userClient: async () => client, mediaDir: dir }
  );
  return { actions, log, dir };
};

const LIST = {
  className: 'account.WallPapers',
  hash: 1n,
  wallpapers: [image, pattern, colours],
};

test('the list is asked with hash 0, shaped for the page and kept', async () => {
  const { actions, log, dir } = await make(() => LIST);
  const answer = await actions.wallpapers();
  assert.equal(answer.ok, true);
  assert.deepEqual(
    answer.wallpapers.map((w) => [w.id, w.kind]),
    [
      ['11', 'image'],
      ['12', 'pattern'],
      ['13', 'colors'],
    ]
  );
  assert.equal(log[0].className, 'GetWallPapers');
  assert.equal(log[0].hash, 0n);
  await actions.wallpapers();
  assert.equal(log.length, 1);
  await rm(dir, { recursive: true, force: true });
});

test('a picture is downloaded through Telegram once, then kept on disk', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3]);
  const thumb = Buffer.from([0xff, 0xd8, 9]);
  const { actions, log, dir } = await make(() => LIST, {
    full: jpeg,
    m: thumb,
  });
  await actions.wallpapers();
  const full = await actions.wallpaperFile({ id: '11', size: 'full' });
  assert.deepEqual(full, { buffer: jpeg, mimeType: 'image/jpeg' });
  const small = await actions.wallpaperFile({ id: '11', size: 'thumb' });
  assert.deepEqual(small.buffer, thumb);
  const before = log.length;
  await actions.wallpaperFile({ id: '11', size: 'full' });
  assert.equal(log.length, before);
  // A wallpaper nobody listed, and a bad id, are not fetched.
  assert.equal(await actions.wallpaperFile({ id: '99' }), null);
  assert.equal(await actions.wallpaperFile({ id: 'x; rm' }), null);
  assert.equal(await actions.wallpaperFile({ id: '11', size: 'big' }), null);
  await rm(dir, { recursive: true, force: true });
});

test('a pattern is served as sanitized SVG', async () => {
  const { actions, dir } = await make(() => LIST, {
    full: zlib.gzipSync(Buffer.from(EVIL)),
  });
  await actions.wallpapers();
  const got = await actions.wallpaperFile({ id: '12', size: 'full' });
  assert.equal(got.mimeType, 'image/svg+xml');
  assert.doesNotMatch(got.buffer.toString(), /script|onload/i);
  await rm(dir, { recursive: true, force: true });
});

test('a chat’s own wallpaper unknown to the list is asked by its slug', async () => {
  const { actions, log, dir } = await make(
    (request) => (request.className === 'GetWallPaper' ? image : LIST),
    { full: Buffer.from([0xff, 0xd8, 7]) }
  );
  const got = await actions.wallpaperFile({ id: '11', slug: 'blue-sky' });
  assert.equal(got.mimeType, 'image/jpeg');
  assert.equal(log[0].className, 'GetWallPaper');
  assert.equal(log[0].wallpaper.slug, 'blue-sky');
  // The slug must be the wallpaper's own: another id is refused.
  assert.equal(
    await actions.wallpaperFile({ id: '55', slug: 'blue-sky', size: 'thumb' }),
    null
  );
  await rm(dir, { recursive: true, force: true });
});

test('setting a chat’s wallpaper sends a listed one for the user only', async () => {
  const { actions, log, dir } = await make(() => LIST);
  assert.equal(
    (await actions.setChatWallpaper({ chat: '42', id: '11' })).ok,
    false
  );
  await actions.wallpapers();
  assert.deepEqual(await actions.setChatWallpaper({ chat: '42', id: '11' }), {
    ok: true,
  });
  const sent = log.find((r) => r.className === 'SetChatWallPaper');
  assert.equal(sent.wallpaper.className, 'InputWallPaper');
  assert.equal(sent.wallpaper.id, 11n);
  assert.equal(sent.wallpaper.accessHash, 5n);
  assert.equal(sent.forBoth, undefined);
  await actions.setChatWallpaper({ chat: '42', id: '13' });
  const plain = log.filter((r) => r.className === 'SetChatWallPaper').at(-1);
  assert.equal(plain.wallpaper.className, 'InputWallPaperNoFile');
  assert.equal(plain.settings.backgroundColor, 0xff0000);
  await rm(dir, { recursive: true, force: true });
});

test('Telegram’s refusal becomes a code', async () => {
  let refuse = false;
  const { actions, dir } = await make((request) => {
    if (refuse && request.className === 'SetChatWallPaper') {
      return Object.assign(new Error('x'), {
        errorMessage: 'WALLPAPER_INVALID',
      });
    }
    return LIST;
  });
  await actions.wallpapers();
  refuse = true;
  const answer = await actions.setChatWallpaper({ chat: '42', id: '11' });
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'invalid');
  await rm(dir, { recursive: true, force: true });
});

test('the routes check their input before the account is asked', async () => {
  const asked = [];
  const account = {
    wallpapers: async (b) => (asked.push(['list', b]), { ok: true }),
    setChatWallpaper: async (b) => (asked.push(['set', b]), { ok: true }),
  };
  assert.equal((await post('wallpapers', {}, account)).status, 200);
  assert.equal(
    (await post('wallpapers', { fresh: 'yes' }, account)).status,
    400
  );
  assert.equal(
    (await post('chat-wallpaper-set', { chat: '42', id: '11' }, account))
      .status,
    200
  );
  for (const body of [
    {},
    { chat: '42' },
    { id: '11' },
    { chat: 'x', id: '11' },
    { chat: '42', id: '1; drop' },
    { chat: '42', id: '' },
  ]) {
    assert.equal(
      (await post('chat-wallpaper-set', body, account)).status,
      400,
      JSON.stringify(body)
    );
  }
  assert.equal(
    (await post('chat-wallpaper-set', { chat: '42', id: '11' }, {})).status,
    400
  );
  assert.deepEqual(asked, [
    ['list', { fresh: false }],
    ['set', { chat: '42', id: '11' }],
  ]);
});

const get = async (url, account, headers = {}) => {
  const req = Object.assign(Readable.from([]), {
    method: 'GET',
    url,
    headers: { host: '127.0.0.1:8787', ...headers },
  });
  const out = {};
  const res = {
    setHeader() {},
    writeHead(status, head) {
      out.status = status;
      out.head = head;
    },
    end(body) {
      out.body = body;
    },
  };
  await handleTelegramRoutes(req, res, url.split('?')[0], {
    telegramAccount: account,
    allowOrigins: [],
  });
  return out;
};

test('the picture route validates, serves with a locked-down policy', async () => {
  const calls = [];
  const account = {
    wallpaperFile: async (q) => {
      calls.push(q);
      return q.id === '12'
        ? { buffer: Buffer.from('<svg/>'), mimeType: 'image/svg+xml' }
        : null;
    },
  };
  for (const url of [
    '/api/telegram/wallpaper?id=x',
    '/api/telegram/wallpaper',
    '/api/telegram/wallpaper?id=12&size=huge',
    '/api/telegram/wallpaper?id=12&slug=../etc',
  ]) {
    assert.equal((await get(url, account)).status, 400, url);
  }
  assert.equal(calls.length, 0);
  assert.equal(
    (await get('/api/telegram/wallpaper?id=13', account)).status,
    404
  );
  const ok = await get(
    '/api/telegram/wallpaper?id=12&slug=dots&size=thumb',
    account
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.head['content-type'], 'image/svg+xml');
  assert.match(ok.head['content-security-policy'], /default-src 'none'/);
  assert.deepEqual(calls.at(-1), { id: '12', slug: 'dots', size: 'thumb' });
  // Another site's page may not load it.
  const cross = await get('/api/telegram/wallpaper?id=12', account, {
    'sec-fetch-site': 'cross-site',
  });
  assert.equal(cross.status, 403);
});
