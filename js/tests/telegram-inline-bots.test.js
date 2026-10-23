// Inline bots in the message box (R-Y138): the bot found by its name, the
// answers asked for (and kept for as long as the bot says), one sent with
// its reply, Telegram's errors as codes, the routes' strict validation and
// the page's pure helpers. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rememberInputs } from '../src/sources/telegram-send-as-client.js';
import { createInlineBots } from '../src/sources/telegram-inline-bots.js';
import {
  layoutOf,
  mergeResults,
  parseInline,
} from '../src/web/chat-inline-bots.js';
import {
  fakeClient,
  helpers,
  named,
  post,
  telegramError,
} from './helpers/telegram-fakes.mjs';

const Api = {
  contacts: { ResolveUsername: named('ResolveUsername') },
  messages: {
    GetInlineBotResults: named('GetInlineBotResults'),
    SendInlineBotResult: named('SendInlineBotResult'),
    StartBot: named('StartBot'),
  },
  InputUser: named('InputUser'),
  InputPeerUser: named('InputPeerUser'),
  InputReplyToMessage: named('InputReplyToMessage'),
};

const gifBot = {
  id: 9n,
  accessHash: 5n,
  bot: true,
  username: 'gif',
  firstName: 'GIF',
  botInlinePlaceholder: 'Search GIFs',
};
const page = (extra = {}) => ({
  queryId: 777n,
  gallery: true,
  nextOffset: '20',
  cacheTime: 60,
  results: [
    {
      className: 'BotInlineMediaResult',
      id: 'a',
      type: 'gif',
      document: { className: 'Document', id: 1n },
    },
    {
      className: 'BotInlineResult',
      id: 'b',
      type: 'article',
      title: 'Title',
      description: 'About',
      thumb: { url: 'https://third.party/x.jpg' },
    },
  ],
  switchPm: { text: 'Open', startParam: 'p' },
  ...extra,
});

const make = (answer, clock = { t: 0 }) => {
  const log = [];
  const applied = [];
  const remembered = [];
  const client = fakeClient(answer, log);
  const lists = {
    remember: (docs, from, kind) => {
      remembered.push({ from, kind });
      return docs.map((d) => ({ id: String(d.id), kind }));
    },
    onAgain: () => {},
  };
  const actions = createInlineBots(
    {
      importer: async () => ({
        Api,
        helpers: {
          ...helpers,
          readBigIntFromBuffer: (buf) => BigInt(`0x${buf.toString('hex')}`),
        },
      }),
      connection: {
        withPeer: async (_c, chat, use) => use({ chat }),
      },
    },
    {
      userClient: async () => client,
      apply: async (_c, result) => applied.push(result),
      lists,
      now: () => clock.t,
    }
  );
  return { actions, log, applied, remembered, clock, client };
};

const standard = (request) => {
  if (request.className === 'ResolveUsername') {
    return { users: [gifBot] };
  }
  return request.className === 'GetInlineBotResults'
    ? page()
    : { className: 'Updates' };
};

test('a bot with an inline placeholder is found; others are not', async () => {
  const { actions } = make((r) =>
    r.username === 'gif'
      ? { users: [gifBot] }
      : { users: [{ ...gifBot, botInlinePlaceholder: undefined }] }
  );
  const found = await actions.inlineBot({ username: 'gif' });
  assert.deepEqual(found, {
    ok: true,
    bot: { id: '9', username: 'gif', name: 'GIF', placeholder: 'Search GIFs' },
  });
  assert.equal(
    (await actions.inlineBot({ username: 'plain' })).code,
    'not-inline'
  );
  assert.equal((await actions.inlineBot({ username: 'x' })).code, 'no-bot');
});

test('results are asked in the chat and kept by the bot cache time', async () => {
  const { actions, log, remembered, clock } = make(standard);
  const body = { chat: '42', username: 'gif', query: 'cats' };
  const first = await actions.inlineResults(body);
  assert.equal(first.ok, true);
  assert.equal(first.queryId, '777');
  assert.equal(first.results[0].queryId, '777');
  assert.equal(first.gallery, true);
  assert.equal(first.next, '20');
  assert.deepEqual(first.switchPm, { text: 'Open', startParam: 'p' });
  assert.deepEqual(first.results[0].doc, { id: '1', kind: 'gif' });
  // A web address is never handed to the page.
  assert.equal(first.results[1].doc, null);
  assert.ok(!JSON.stringify(first).includes('third.party'));
  assert.equal(remembered.length, 1);
  const ask = log.find((r) => r.className === 'GetInlineBotResults');
  assert.equal(ask.query, 'cats');
  assert.equal(ask.offset, '');
  assert.equal(ask.peer.chat, '42');
  assert.equal(ask.bot.userId, 9n);

  const asked = () =>
    log.filter((r) => r.className === 'GetInlineBotResults').length;
  await actions.inlineResults(body);
  assert.equal(asked(), 1, 'kept');
  clock.t += 61_000;
  await actions.inlineResults(body);
  assert.equal(asked(), 2, 'asked again after the cache time');
  await actions.inlineResults({ ...body, offset: '20' });
  assert.equal(asked(), 3, 'another page is another answer');
  assert.equal(log.filter((r) => r.className === 'ResolveUsername').length, 1);
});

test('the cache time is capped and zero keeps nothing', async () => {
  const long = make((r) =>
    r.className === 'GetInlineBotResults'
      ? page({ cacheTime: 100000 })
      : standard(r)
  );
  const body = { chat: '1', username: 'gif', query: 'q' };
  await long.actions.inlineResults(body);
  long.clock.t += 299_000;
  await long.actions.inlineResults(body);
  assert.equal(
    long.log.filter((r) => r.className === 'GetInlineBotResults').length,
    1
  );
  long.clock.t += 2_000;
  await long.actions.inlineResults(body);
  assert.equal(
    long.log.filter((r) => r.className === 'GetInlineBotResults').length,
    2
  );
  const none = make((r) =>
    r.className === 'GetInlineBotResults' ? page({ cacheTime: 0 }) : standard(r)
  );
  await none.actions.inlineResults(body);
  await none.actions.inlineResults(body);
  assert.equal(
    none.log.filter((r) => r.className === 'GetInlineBotResults').length,
    2
  );
});

test('sending takes only an answer given in that chat, with the reply', async () => {
  const { actions, log, applied } = make(standard);
  const body = { chat: '42', username: 'gif', query: 'cats' };
  assert.equal(
    (await actions.inlineSend({ chat: '42', queryId: '777', id: 'a' })).code,
    'expired'
  );
  await actions.inlineResults(body);
  assert.equal(
    (await actions.inlineSend({ chat: '43', queryId: '777', id: 'a' })).code,
    'expired',
    'another chat'
  );
  assert.equal(
    (await actions.inlineSend({ chat: '42', queryId: '777', id: 'zzz' })).code,
    'expired',
    'an id the bot did not give'
  );
  const sent = await actions.inlineSend({
    chat: '42',
    queryId: '777',
    id: 'b',
    replyTo: 5,
    clientId: 'c1',
  });
  assert.deepEqual(sent, { ok: true, chat: '42' });
  const request = log.find((r) => r.className === 'SendInlineBotResult');
  assert.equal(request.queryId, 777n);
  assert.equal(request.id, 'b');
  assert.equal(request.peer.chat, '42');
  assert.equal(request.replyTo.replyToMsgId, 5);
  assert.equal(request.clearDraft, false);
  assert.equal(applied.length, 1);
});

test("Telegram's errors become codes", async () => {
  const codes = {
    BOT_INLINE_DISABLED: 'bot-inline-disabled',
    BOT_RESPONSE_TIMEOUT: 'bot-timeout',
    USERNAME_NOT_OCCUPIED: 'no-bot',
    CHAT_SEND_INLINE_FORBIDDEN: 'inline-forbidden',
  };
  for (const [name, code] of Object.entries(codes)) {
    const { actions } = make((r) =>
      r.className === 'ResolveUsername' && name === 'USERNAME_NOT_OCCUPIED'
        ? telegramError(name)
        : r.className === 'GetInlineBotResults'
          ? telegramError(name)
          : standard(r)
    );
    const body = { chat: '1', username: 'gif', query: name };
    const answer =
      name === 'USERNAME_NOT_OCCUPIED'
        ? await actions.inlineBot({ username: 'gif' })
        : await actions.inlineResults(body);
    assert.deepEqual(answer, { ok: false, error: name, code });
  }
  const { actions } = make((r) =>
    r.className === 'SendInlineBotResult'
      ? telegramError('QUERY_ID_INVALID')
      : standard(r)
  );
  await actions.inlineResults({ chat: '1', username: 'gif', query: 'a' });
  const failed = await actions.inlineSend({
    chat: '1',
    queryId: '777',
    id: 'a',
  });
  assert.equal(failed.code, 'expired');
  assert.equal(
    (
      await make(() => telegramError('BOOM')).actions.inlineBot({
        username: 'gif',
      })
    ).code,
    'failed'
  );
});

test('a bad request is refused before Telegram is asked', async () => {
  const { actions, log } = make(standard);
  for (const body of [
    { chat: 'x', username: 'gif', query: 'a' },
    { chat: '1', username: 'no way', query: 'a' },
    { chat: '1', username: 'gif', query: 'a'.repeat(300) },
  ]) {
    assert.equal((await actions.inlineResults(body)).code, 'bad-request');
  }
  assert.equal(log.length, 0);
});

test('the routes validate strictly', async () => {
  const calls = [];
  const account = {
    inlineBot: async (b) => (calls.push(['bot', b]), { ok: true }),
    inlineResults: async (b) => (calls.push(['results', b]), { ok: true }),
    inlineSend: async (b) => (calls.push(['send', b]), { ok: true }),
    inlineStartBot: async (b) => (calls.push(['start', b]), { ok: true }),
  };
  const good = [
    ['inline-bot', { username: 'gif' }],
    [
      'inline-results',
      { chat: '-100', username: 'gif', query: 'cats', offset: '2' },
    ],
    ['inline-send', { chat: '5', queryId: '77', id: 'a', replyTo: 3 }],
  ];
  for (const [route, body] of good) {
    assert.equal((await post(route, body, account)).status, 200, route);
  }
  assert.equal(calls.length, 3);
  const bad = [
    ['inline-bot', {}],
    ['inline-bot', { username: 'a b' }],
    ['inline-bot', { username: 'x' }],
    ['inline-results', { chat: 5, username: 'gif', query: 'a' }],
    ['inline-results', { chat: '5', username: 'gif', query: 7 }],
    ['inline-results', { chat: '5', username: 'gif', query: 'a'.repeat(257) }],
    ['inline-results', { chat: '5', username: 'gif', query: 'a\nb' }],
    ['inline-results', { chat: '5', username: 'gif', query: 'a', offset: {} }],
    ['inline-send', { chat: '5', queryId: 'abc', id: 'a' }],
    ['inline-send', { chat: '5', queryId: '1', id: '' }],
    ['inline-send', { chat: '5', queryId: '1', id: 'a'.repeat(129) }],
    ['inline-send', { chat: '5', queryId: '1', id: 'a', replyTo: -1 }],
    ['inline-send', { chat: '5', queryId: 1, id: 'a' }],
  ];
  for (const [route, body] of bad) {
    assert.equal(
      (await post(route, body, account)).status,
      400,
      JSON.stringify(body)
    );
  }
  assert.equal(calls.length, 3, 'nothing reached the account');
  assert.equal((await post('inline-bot', { username: 'gif' }, {})).status, 400);
});

test('the page reads "@bot words" and lays results out', () => {
  assert.deepEqual(parseInline('@gif cats'), {
    username: 'gif',
    query: 'cats',
  });
  assert.deepEqual(parseInline('@wiki  moscow  '), {
    username: 'wiki',
    query: 'moscow',
  });
  assert.deepEqual(parseInline('@pic '), { username: 'pic', query: '' });
  assert.equal(parseInline('@gif'), null);
  assert.equal(parseInline('hi @gif cats'), null);
  assert.equal(parseInline('@a b'), null);
  assert.equal(layoutOf({ gallery: true, results: [] }), 'grid');
  assert.equal(
    layoutOf({ gallery: false, results: [{ doc: { id: '1' } }] }),
    'grid'
  );
  assert.equal(layoutOf({ gallery: false, results: [{ doc: null }] }), 'list');
  const merged = mergeResults(
    { results: [{ id: 'a' }], next: '1' },
    { results: [{ id: 'a' }, { id: 'b' }], next: null }
  );
  assert.deepEqual(
    merged.results.map((r) => r.id),
    ['a', 'b']
  );
  assert.equal(merged.next, null);
});

test('an inline send goes as the picked identity (R-Y147)', async () => {
  const { actions, log, client } = make(standard);
  rememberInputs(client, new Map([['-1009', 'AS-INPUT']]));
  await actions.inlineResults({ chat: '-100', username: 'gif', query: 'c' });
  const sent = await actions.inlineSend({
    chat: '-100',
    queryId: '777',
    id: 'a',
    sendAs: '-1009',
  });
  assert.equal(sent.ok, true);
  assert.equal(
    log.find((r) => r.className === 'SendInlineBotResult').sendAs,
    'AS-INPUT'
  );
  const plain = await actions.inlineSend({
    chat: '-100',
    queryId: '777',
    id: 'b',
  });
  assert.equal(plain.ok, true);
  const last = log.filter((r) => r.className === 'SendInlineBotResult').at(-1);
  assert.equal(last.sendAs, undefined);
});

test('the inline routes refuse a bad sendAs or start parameter (R-Y147)', async () => {
  const seen = [];
  const account = {
    inlineSend: async (b) => (seen.push(b), { ok: true }),
    inlineStartBot: async () => ({ ok: true }),
  };
  const body = { chat: '5', queryId: '77', id: 'a' };
  const status = async (route, b) => (await post(route, b, account)).status;
  assert.equal(await status('inline-send', { ...body, sendAs: 'x' }), 400);
  assert.equal(await status('inline-send', { ...body, sendAs: 5 }), 400);
  assert.equal(await status('inline-send', { ...body, sendAs: '-1009' }), 200);
  assert.equal(seen[0].sendAs, '-1009');
  for (const startParam of ['', 'p_1-x']) {
    assert.equal(
      await status('inline-start-bot', { username: 'gif', startParam }),
      200
    );
  }
  for (const startParam of ['a b', 'x'.repeat(65), 5, undefined]) {
    assert.equal(
      await status('inline-start-bot', { username: 'gif', startParam }),
      400,
      String(startParam)
    );
  }
});

test('switch to PM starts the bot with the parameter its answer offered (R-Y147)', async () => {
  const { actions, log, applied } = make(standard);
  const none = await actions.inlineStartBot({
    username: 'gif',
    startParam: 'p',
  });
  assert.equal(none.code, 'expired', 'not offered yet');
  await actions.inlineResults({ chat: '42', username: 'gif', query: 'cats' });
  const other = await actions.inlineStartBot({
    username: 'gif',
    startParam: 'other',
  });
  assert.equal(other.code, 'expired', 'another parameter');
  const done = await actions.inlineStartBot({
    username: 'GIF',
    startParam: 'p',
  });
  assert.deepEqual(done, { ok: true, chat: '9' });
  const request = log.find((r) => r.className === 'StartBot');
  assert.equal(request.startParam, 'p');
  assert.equal(request.bot.userId, 9n);
  assert.equal(request.peer.className, 'InputPeerUser');
  assert.equal(request.peer.userId, 9n);
  assert.equal(typeof request.randomId, 'bigint');
  assert.equal(applied.length, 1);
});
