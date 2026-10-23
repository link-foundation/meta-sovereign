// Instant View (R-Y205): a Page shaped into a safe tree (many blocks,
// nested rich text, unsafe links dropped), the account action with a fake
// client, its picture download, the routes' validation, and the page's
// pure helpers and renderer. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  shapePage,
  shapeText,
  safeHref,
} from '../src/sources/telegram-instant-view-shape.js';
import { createInstantView } from '../src/sources/telegram-instant-view.js';
import {
  ivLinkTarget,
  rememberInstantUrl,
  instantTargetOf,
} from '../src/web/chat-instant-view-open.js';
import { Blocks, linkOf } from '../src/web/chat-instant-view-render.js';
import { errorKey } from '../src/web/chat-instant-view.js';
import { named, postRoute } from './helpers/telegram-route.js';

const n = (className, fields = {}) => ({ className, ...fields });
const plainText = (text) => n('TextPlain', { text });
const caption = (text = '') =>
  n('PageCaption', { text: plainText(text), credit: n('TextEmpty') });

test('safeHref keeps http, https and tg only', () => {
  assert.equal(safeHref('https://a.test/x?y=1'), 'https://a.test/x?y=1');
  assert.equal(safeHref('tg://resolve?domain=a'), 'tg://resolve?domain=a');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('data:text/html,hi'), null);
  assert.equal(safeHref('https://user:pw@a.test/'), null);
  assert.equal(safeHref('not a url'), null);
  assert.equal(safeHref(''), null);
});

test('nested rich text: formats, links, concat, images, anchors', () => {
  const ctx = {
    url: 'https://a.test/page',
    photos: new Set(),
    documents: new Set(),
  };
  const rich = n('TextConcat', {
    texts: [
      plainText('Hello '),
      n('TextBold', {
        text: n('TextItalic', {
          text: n('TextUrl', {
            text: plainText('deep'),
            url: 'https://b.test/',
            webpageId: 0n,
          }),
        }),
      }),
      n('TextSubscript', { text: plainText('2') }),
      n('TextSuperscript', { text: plainText('3') }),
      n('TextMarked', { text: plainText('m') }),
      n('TextFixed', { text: plainText('c') }),
      n('TextStrike', { text: plainText('s') }),
      n('TextUnderline', { text: plainText('u') }),
      n('TextEmail', { text: plainText('mail'), email: 'a@b.test' }),
      n('TextPhone', { text: plainText('call'), phone: '+1 (555) 010-2030' }),
      n('TextImage', { documentId: 77n, w: 10, h: 12 }),
      n('TextAnchor', { text: plainText('here'), name: 'top' }),
      n('TextUrl', {
        text: plainText('jump'),
        url: 'https://a.test/page#sec',
        webpageId: 0n,
      }),
    ],
  });
  const nodes = shapeText(rich, ctx);
  assert.deepEqual(nodes[0], { t: 'text', s: 'Hello ' });
  assert.deepEqual(nodes[1], {
    t: 'b',
    c: [
      {
        t: 'i',
        c: [{ t: 'a', href: 'https://b.test/', c: [{ t: 'text', s: 'deep' }] }],
      },
    ],
  });
  assert.deepEqual(
    nodes.slice(2, 8).map((x) => x.t),
    ['sub', 'sup', 'mark', 'code', 's', 'u']
  );
  assert.equal(nodes[8].href, 'mailto:a@b.test');
  assert.equal(nodes[9].href, 'tel:+15550102030');
  assert.deepEqual(nodes[10], { t: 'img', id: '77', w: 10, h: 12 });
  assert.deepEqual(nodes[11], {
    t: 'anchor',
    name: 'top',
    c: [{ t: 'text', s: 'here' }],
  });
  assert.deepEqual(nodes[12], {
    t: 'a',
    anchor: 'sec',
    c: [{ t: 'text', s: 'jump' }],
  });
  assert.deepEqual([...ctx.documents], ['77']);
});

test('an unsafe link keeps its words and loses the link', () => {
  const nodes = shapeText(
    n('TextConcat', {
      texts: [
        n('TextUrl', {
          text: plainText('click'),
          url: 'javascript:alert(1)',
          webpageId: 0n,
        }),
        n('TextEmail', { text: plainText('bad'), email: 'x"onmouseover=1' }),
      ],
    })
  );
  assert.deepEqual(nodes, [
    { t: 'text', s: 'click' },
    { t: 'text', s: 'bad' },
  ]);
  assert.ok(!JSON.stringify(nodes).includes('javascript'));
});

const bigPage = () =>
  n('Page', {
    url: 'https://a.test/page',
    rtl: false,
    blocks: [
      n('PageBlockKicker', { text: plainText('News') }),
      n('PageBlockTitle', { text: plainText('Title') }),
      n('PageBlockSubtitle', { text: plainText('Sub') }),
      n('PageBlockAuthorDate', {
        author: plainText('Ann'),
        publishedDate: 1700000000,
      }),
      n('PageBlockHeader', { text: plainText('H') }),
      n('PageBlockSubheader', { text: plainText('SH') }),
      n('PageBlockParagraph', { text: plainText('Body') }),
      n('PageBlockPreformatted', { text: plainText('x = 1'), language: 'js' }),
      n('PageBlockFooter', { text: plainText('End') }),
      n('PageBlockDivider'),
      n('PageBlockAnchor', { name: 'top' }),
      n('PageBlockList', {
        items: [
          n('PageListItemText', { text: plainText('one') }),
          n('PageListItemBlocks', {
            blocks: [n('PageBlockParagraph', { text: plainText('two') })],
          }),
        ],
      }),
      n('PageBlockOrderedList', {
        items: [
          n('PageListOrderedItemText', { num: '1.', text: plainText('first') }),
        ],
      }),
      n('PageBlockBlockquote', {
        text: plainText('Q'),
        caption: plainText('who'),
      }),
      n('PageBlockPullquote', { text: plainText('P'), caption: plainText('') }),
      n('PageBlockPhoto', {
        photoId: 5n,
        caption: caption('pic'),
        url: 'https://a.test/big',
      }),
      n('PageBlockVideo', {
        videoId: 6n,
        caption: caption('vid'),
        autoplay: true,
      }),
      n('PageBlockCover', {
        cover: n('PageBlockPhoto', { photoId: 9n, caption: caption() }),
      }),
      n('PageBlockEmbed', {
        url: 'https://v.test/e',
        html: '<script>alert(1)</script>',
        caption: caption('emb'),
      }),
      n('PageBlockEmbedPost', {
        url: 'https://t.me/x/1',
        webpageId: 0n,
        authorPhotoId: 0n,
        author: 'Bob',
        date: 1700000000,
        blocks: [n('PageBlockParagraph', { text: plainText('post') })],
        caption: caption(),
      }),
      n('PageBlockCollage', {
        items: [n('PageBlockPhoto', { photoId: 5n, caption: caption() })],
        caption: caption('col'),
      }),
      n('PageBlockSlideshow', {
        items: [n('PageBlockPhoto', { photoId: 5n, caption: caption() })],
        caption: caption(),
      }),
      n('PageBlockChannel', {
        channel: n('Channel', { title: 'Chan', username: 'chan_x' }),
      }),
      n('PageBlockAudio', { audioId: 8n, caption: caption('aud') }),
      n('PageBlockTable', {
        bordered: true,
        striped: true,
        title: plainText('T'),
        rows: [
          n('PageTableRow', {
            cells: [
              n('PageTableCell', {
                header: true,
                text: plainText('a'),
                colspan: 2,
              }),
              n('PageTableCell', { alignRight: true, text: plainText('b') }),
            ],
          }),
        ],
      }),
      n('PageBlockDetails', {
        open: false,
        title: plainText('More'),
        blocks: [n('PageBlockParagraph', { text: plainText('hidden') })],
      }),
      n('PageBlockRelatedArticles', {
        title: plainText('Related'),
        articles: [
          n('PageRelatedArticle', {
            url: 'https://r.test/1',
            webpageId: 0n,
            title: 'R1',
            photoId: 5n,
          }),
          n('PageRelatedArticle', { url: 'javascript:x', webpageId: 0n }),
        ],
      }),
      n('PageBlockMap', {
        geo: n('GeoPoint', { lat: 1.5, long: 2.5 }),
        zoom: 12,
        w: 1,
        h: 1,
        caption: caption('map'),
      }),
      n('PageBlockUnsupported'),
    ],
  });

test('shapePage handles every block kind and drops the unsupported', () => {
  const shaped = shapePage(bigPage());
  assert.deepEqual(
    shaped.blocks.map((b) => b.k),
    [
      'kicker',
      'title',
      'subtitle',
      'authordate',
      'header',
      'subheader',
      'p',
      'pre',
      'footer',
      'divider',
      'anchor',
      'list',
      'list',
      'quote',
      'pullquote',
      'photo',
      'video',
      'cover',
      'embed',
      'embedpost',
      'collage',
      'slideshow',
      'channel',
      'audio',
      'table',
      'details',
      'related',
      'map',
    ]
  );
  const by = (k) => shaped.blocks.find((b) => b.k === k);
  assert.equal(by('pre').language, 'js');
  assert.equal(by('list').items[1].blocks[0].k, 'p');
  assert.equal(shaped.blocks[12].ordered, true);
  assert.equal(shaped.blocks[12].items[0].num, '1.');
  assert.equal(by('photo').href, 'https://a.test/big');
  assert.equal(by('cover').block.id, '9');
  assert.equal(by('embed').href, 'https://v.test/e');
  assert.ok(!JSON.stringify(shaped).includes('<script'));
  assert.equal(by('channel').username, 'chan_x');
  assert.equal(by('table').rows[0][0].colspan, 2);
  assert.equal(by('table').rows[0][1].right, true);
  assert.equal(by('details').blocks.length, 1);
  assert.equal(by('related').articles.length, 1);
  assert.equal(by('map').lat, 1.5);
  assert.deepEqual(shaped.photos.sort(), ['5', '9']);
  assert.deepEqual(shaped.documents.sort(), ['6', '8']);
});

test('shapePage stops at a deep nesting', () => {
  let block = n('PageBlockParagraph', { text: plainText('deep') });
  for (let i = 0; i < 40; i += 1) {
    block = n('PageBlockDetails', { title: plainText('d'), blocks: [block] });
  }
  const shaped = shapePage(n('Page', { url: 'u', blocks: [block] }));
  let depth = 0;
  for (let b = shaped.blocks[0]; b?.blocks?.[0]; b = b.blocks[0]) {
    depth += 1;
  }
  assert.ok(depth < 20);
});

// ---- the account action ----

const Api = {
  messages: { GetWebPage: named('GetWebPage') },
  InputPhotoFileLocation: named('InputPhotoFileLocation'),
  InputDocumentFileLocation: named('InputDocumentFileLocation'),
};

const photo = () =>
  n('Photo', {
    id: 5n,
    accessHash: 1n,
    fileReference: new Uint8Array([1]),
    dcId: 2,
    sizes: [n('PhotoSize', { type: 'x', size: 100, w: 1, h: 1 })],
  });

const make = (answer) => {
  const log = [];
  const downloads = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    downloadFile: async (location) => {
      downloads.push(location);
      return Buffer.from('jpeg');
    },
  };
  const actions = createInstantView(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
    },
    { userClient: async () => client }
  );
  return { actions, log, downloads };
};

const webWith = (cachedPage) =>
  n('messages.WebPage', {
    webpage: n('WebPage', { siteName: 'Site', title: 'T', cachedPage }),
  });

test('instantView asks getWebPage and returns the shaped page', async () => {
  const page = n('Page', {
    url: 'https://a.test/p',
    blocks: [n('PageBlockPhoto', { photoId: 5n, caption: caption() })],
    photos: [photo()],
    documents: [],
  });
  const { actions, log } = make(() => webWith(page));
  const answer = await actions.instantView({ url: 'https://a.test/p' });
  assert.equal(log[0].url, 'https://a.test/p');
  assert.equal(log[0].hash, 0);
  assert.equal(answer.ok, true);
  assert.equal(answer.available, true);
  assert.equal(answer.siteName, 'Site');
  assert.equal(answer.page.blocks[0].k, 'photo');
  assert.equal(answer.page.photos, undefined);
  // Asked again: the kept answer, no second request.
  await actions.instantView({ url: 'https://a.test/p' });
  assert.equal(log.length, 1);
});

test('a t.me/iv link asks for the url inside it', async () => {
  const { actions, log } = make(() => webWith(undefined));
  const answer = await actions.instantView({
    url: 'https://t.me/iv?url=https%3A%2F%2Fa.test%2Fq&rhash=abc',
  });
  assert.equal(log[0].url, 'https://a.test/q');
  assert.deepEqual(answer, { ok: true, available: false });
});

test('no cached page is not available; errors become codes', async () => {
  const none = make(() =>
    n('messages.WebPage', { webpage: n('WebPageEmpty') })
  );
  assert.deepEqual(await none.actions.instantView({ url: 'https://a.test/' }), {
    ok: true,
    available: false,
  });
  const err = (message) =>
    make(() => Object.assign(new Error(message), { errorMessage: message }));
  const missing = await err('WEBPAGE_NOT_FOUND').actions.instantView({
    url: 'https://a.test/',
  });
  assert.deepEqual([missing.ok, missing.code], [false, 'not-found']);
  const flood = await err('FLOOD_WAIT_3').actions.instantView({
    url: 'https://b.test/',
  });
  assert.equal(flood.code, 'flood');
});

test('bad urls and hashes are refused before Telegram is asked', async () => {
  const { actions, log } = make(() => webWith(undefined));
  for (const url of [
    'javascript:alert(1)',
    'tg://x',
    '',
    5,
    'https://t.me/iv?url=javascript:1',
  ]) {
    assert.equal((await actions.instantView({ url })).code, 'bad-request');
  }
  assert.equal(
    (await actions.instantView({ url: 'https://a.test/', hash: -1 })).code,
    'bad-request'
  );
  assert.equal(log.length, 0);
});

test('instantViewFile serves only pictures a page used', async () => {
  const page = n('Page', {
    url: 'https://a.test/p',
    blocks: [n('PageBlockPhoto', { photoId: 5n, caption: caption() })],
    photos: [photo(), n('Photo', { id: 6n, sizes: [] })],
    documents: [],
  });
  const { actions, downloads } = make(() => webWith(page));
  assert.equal(await actions.instantViewFile({ kind: 'photo', id: '5' }), null);
  await actions.instantView({ url: 'https://a.test/p' });
  const got = await actions.instantViewFile({ kind: 'photo', id: '5' });
  assert.equal(got.mimeType, 'image/jpeg');
  assert.equal(got.buffer.toString(), 'jpeg');
  assert.equal(downloads[0].className, 'InputPhotoFileLocation');
  assert.equal(downloads[0].thumbSize, 'x');
  await actions.instantViewFile({ kind: 'photo', id: '5' });
  assert.equal(downloads.length, 1);
  // Not used by the page, or a bad kind or id.
  assert.equal(await actions.instantViewFile({ kind: 'photo', id: '6' }), null);
  assert.equal(await actions.instantViewFile({ kind: 'file', id: '5' }), null);
  assert.equal(
    await actions.instantViewFile({ kind: 'photo', id: '../5' }),
    null
  );
});

// ---- routes ----

test('the instant-view route validates the body', async () => {
  const calls = [];
  const account = {
    instantView: async (body) => {
      calls.push(body);
      return { ok: true, available: false };
    },
  };
  assert.equal(
    await postRoute('instant-view', { url: 'https://a.test/' }, account),
    200
  );
  assert.equal(
    await postRoute(
      'instant-view',
      { url: 'https://t.me/iv?url=https://a.test/', hash: 5 },
      account
    ),
    200
  );
  for (const body of [
    {},
    { url: 5 },
    { url: 'javascript:alert(1)' },
    { url: 'ftp://a.test/' },
    { url: 'https://a.test/', hash: 'x' },
    { url: 'https://a.test/', hash: -2 },
    { url: 'https://a.test/', hash: 1.5 },
  ]) {
    assert.equal(
      await postRoute('instant-view', body, account),
      400,
      JSON.stringify(body)
    );
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { url: 'https://a.test/' });
  assert.equal(
    await postRoute('instant-view', { url: 'https://a.test/' }, {}),
    400
  );
});

// ---- the page ----

test('t.me/iv links and cached previews are recognised', () => {
  assert.equal(
    ivLinkTarget('https://t.me/iv?url=https%3A%2F%2Fa.test%2Fq&rhash=1'),
    'https://a.test/q'
  );
  assert.equal(
    ivLinkTarget('https://telegram.me/iv?url=https://a.test/'),
    'https://a.test/'
  );
  assert.equal(ivLinkTarget('https://t.me/iv?url=javascript:alert(1)'), null);
  assert.equal(ivLinkTarget('https://t.me/other?url=https://a.test/'), null);
  assert.equal(ivLinkTarget('https://evil.test/iv?url=https://a.test/'), null);
  assert.equal(instantTargetOf('https://a.test/x'), null);
  const forget = rememberInstantUrl('https://a.test/x');
  assert.equal(instantTargetOf('https://a.test/x'), 'https://a.test/x');
  assert.equal(instantTargetOf('HTTPS://A.TEST/x/'), 'https://a.test/x/');
  forget();
  assert.equal(instantTargetOf('https://a.test/x'), null);
});

test('error codes map to text keys', () => {
  assert.equal(errorKey('not-found'), 'chat.iv.err.not-found');
  assert.equal(errorKey('weird'), 'chat.iv.err.failed');
});

test('the renderer draws React elements, safe links and tables', () => {
  assert.equal(linkOf('javascript:alert(1)'), null);
  assert.equal(linkOf('https://a.test/'), 'https://a.test/');
  const shaped = shapePage(bigPage());
  const ctx = {
    t: (key) => key,
    locale: 'en',
    media: (kind, id) => `/m?kind=${kind}&id=${id}`,
    scrollTo() {},
  };
  const html = renderToStaticMarkup(
    React.createElement(Blocks, { blocks: shaped.blocks, ctx })
  );
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.match(html, /<table[^>]*iv-bordered/);
  assert.match(html, /<details[^>]*>/);
  assert.ok(!/<details[^>]* open/.test(html));
  assert.match(html, /colSpan="2"|colspan="2"/i);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /iv-article/);
  assert.match(html, /\/m\?kind=photo&amp;id=5/);
  assert.ok(!/<script/i.test(html));
  assert.ok(!/javascript:/i.test(html));
});
