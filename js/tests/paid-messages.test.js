// Paid messages (R-Y184): what a message costs in a chat, the price one
// charges non-contacts, earnings and exceptions, a supergroup's price, and
// above all that a send into a paid chat is never made without the user's
// confirmation and never carries `allow_paid_stars` other than the total
// confirmed. Fake clients and a fake gate; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PAID_STARS_MAX,
  createPaidMessages,
  validPrice,
} from '../src/sources/telegram-paid-messages.js';
import {
  paidField,
  validPaidStars,
  withSendAs,
} from '../src/sources/telegram-send-as-client.js';
import { sendError, sendText } from '../src/sources/telegram-send.js';
import {
  DECLINED,
  PAID_PREFS_KEY,
  chatOf,
  countOf,
  createGate,
  guardApi,
  isSilenced,
  readPrefs,
  silenced,
  textParts,
  totalOf,
} from '../src/web/paid-send.js';
import { failureText } from '../src/web/chat-failure.js';
import { PRICE_MAX, priceOf } from '../src/web/chat-privacy-paid.js';
import { isPerson } from '../src/web/chat-paid-earnings.js';
import { mayCharge } from '../src/web/chat-paid-send.js';
import { named } from './helpers/telegram-fakes.mjs';
import { postRoute } from './helpers/post-route.js';

const Api = {
  users: { GetRequirementsToContact: named('users.GetRequirementsToContact') },
  channels: {
    GetChannels: named('channels.GetChannels'),
    UpdatePaidMessagesPrice: named('channels.UpdatePaidMessagesPrice'),
  },
  account: {
    GetGlobalPrivacySettings: named('account.GetGlobalPrivacySettings'),
    SetGlobalPrivacySettings: named('account.SetGlobalPrivacySettings'),
    GetPaidMessagesRevenue: named('account.GetPaidMessagesRevenue'),
    ToggleNoPaidMessagesException: named(
      'account.ToggleNoPaidMessagesException'
    ),
  },
  messages: {
    SendMessage: named('messages.SendMessage'),
    SendMedia: named('messages.SendMedia'),
    ForwardMessages: named('messages.ForwardMessages'),
  },
  GlobalPrivacySettings: named('GlobalPrivacySettings'),
};

const make = (answer) => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      const next = answer(request);
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
  const env = {
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  return {
    actions: createPaidMessages(env, { userClient: async () => client }),
    log,
  };
};

const fail = (name) => Object.assign(new Error(name), { errorMessage: name });

test('a person who asks Stars: the price, else free', async () => {
  const paid = make(() => [
    { className: 'RequirementToContactPaidMessages', starsAmount: 25n },
  ]);
  assert.deepEqual(await paid.actions.paidPrice({ chat: '42' }), {
    ok: true,
    stars: 25,
  });
  assert.equal(paid.log[0].className, 'users.GetRequirementsToContact');
  assert.equal(paid.log[0].id[0].chat, '42');
  for (const none of [
    { className: 'RequirementToContactEmpty' },
    { className: 'RequirementToContactPremium' },
  ]) {
    const free = make(() => [none]);
    assert.equal((await free.actions.paidPrice({ chat: '42' })).stars, 0);
  }
});

test('a supergroup charges its members, not its admins; a basic group never', async () => {
  const group = (fields) =>
    make(() => ({
      chats: [{ className: 'Channel', sendPaidMessagesStars: 7n, ...fields }],
    }));
  const member = group({});
  assert.equal((await member.actions.paidPrice({ chat: '-1001' })).stars, 7);
  assert.equal(member.log[0].className, 'channels.GetChannels');
  assert.equal(
    (await group({ creator: true }).actions.paidPrice({ chat: '-1001' })).stars,
    0
  );
  assert.equal(
    (await group({ adminRights: {} }).actions.paidPrice({ chat: '-1001' }))
      .stars,
    0
  );
  const basic = make(() => assert.fail('no request for a basic group'));
  assert.deepEqual(await basic.actions.paidPrice({ chat: '-5' }), {
    ok: true,
    stars: 0,
  });
  assert.equal(
    (await basic.actions.paidPrice({ chat: 'x' })).code,
    'bad-request'
  );
});

test('the price charged to non-contacts is read; Save keeps every other setting', async () => {
  const current = {
    className: 'GlobalPrivacySettings',
    archiveAndMuteNewNoncontactPeers: true,
    hideReadMarks: true,
    keepArchivedFolders: false,
    displayGiftsButton: true,
    noncontactPeersPaidStars: 50n,
  };
  const read = make(() => current);
  assert.deepEqual(await read.actions.paidSettings(), { ok: true, stars: 50 });
  const save = make((request) =>
    request.className === 'account.GetGlobalPrivacySettings' ? current : true
  );
  assert.deepEqual(await save.actions.paidSettingsSave({ stars: 120 }), {
    ok: true,
    stars: 120,
  });
  const set = save.log.find(
    (r) => r.className === 'account.SetGlobalPrivacySettings'
  );
  assert.equal(set.settings.noncontactPeersPaidStars, 120);
  assert.equal(set.settings.archiveAndMuteNewNoncontactPeers, true);
  assert.equal(set.settings.hideReadMarks, true);
  assert.equal(set.settings.displayGiftsButton, true);
  assert.equal('keepArchivedFolders' in set.settings, false);
  // 0 removes the price and nothing else.
  const off = make((request) =>
    request.className === 'account.GetGlobalPrivacySettings' ? current : true
  );
  await off.actions.paidSettingsSave({ stars: 0 });
  const unset = off.log.find(
    (r) => r.className === 'account.SetGlobalPrivacySettings'
  );
  assert.equal('noncontactPeersPaidStars' in unset.settings, false);
  assert.equal(unset.settings.hideReadMarks, true);
});

test('nothing is written for a price Telegram would not take', async () => {
  for (const stars of [-1, 1.5, '5', null, PAID_STARS_MAX + 1, NaN]) {
    const { actions, log } = make(() => assert.fail('no request'));
    assert.equal(
      (await actions.paidSettingsSave({ stars })).code,
      'bad-request'
    );
    assert.equal(
      (await actions.paidPriceSave({ chat: '-1001', stars })).code,
      'bad-request'
    );
    assert.equal(log.length, 0);
    assert.equal(validPrice(stars), false);
  }
  assert.equal(validPrice(0) && validPrice(PAID_STARS_MAX), true);
  const { actions } = make(() => assert.fail('no request'));
  assert.equal(
    (await actions.paidPriceSave({ chat: '-5', stars: 3 })).code,
    'bad-request'
  );
});

test('earnings, and letting a person write free or pay again', async () => {
  const rev = make(() => ({ starsAmount: 310n }));
  assert.deepEqual(await rev.actions.paidRevenue({ user: '42' }), {
    ok: true,
    stars: 310,
  });
  assert.equal(rev.log[0].userId.chat, '42');
  const free = make(() => true);
  await free.actions.paidException({ user: '42', allow: true, refund: true });
  assert.equal(free.log[0].className, 'account.ToggleNoPaidMessagesException');
  assert.equal(free.log[0].refundCharged, true);
  assert.equal('requirePayment' in free.log[0], false);
  const pay = make(() => true);
  await pay.actions.paidException({ user: '42', allow: false, refund: true });
  assert.equal(pay.log[0].requirePayment, true);
  assert.equal('refundCharged' in pay.log[0], false);
  assert.equal(
    (await free.actions.paidException({ user: '42', allow: 'yes' })).code,
    'bad-request'
  );
});

test('a supergroup admin sets the price; Telegram refusals become codes', async () => {
  const ok = make(() => true);
  assert.deepEqual(
    await ok.actions.paidPriceSave({ chat: '-1001', stars: 5 }),
    {
      ok: true,
      stars: 5,
    }
  );
  assert.equal(ok.log[0].className, 'channels.UpdatePaidMessagesPrice');
  assert.equal(ok.log[0].sendPaidMessagesStars, 5);
  assert.equal(ok.log[0].channel.chat, '-1001');
  const denied = make(() => fail('CHAT_ADMIN_REQUIRED'));
  assert.equal(
    (await denied.actions.paidPriceSave({ chat: '-1001', stars: 5 })).code,
    'not-admin'
  );
  const odd = make(() => fail('STARS_AMOUNT_INVALID'));
  assert.equal(
    (await odd.actions.paidSettingsSave({ stars: 5 })).code,
    'bad-price'
  );
});

// ---- sends carry exactly the confirmed Stars --------------------------------

test('paidField and validPaidStars accept only whole positive numbers', () => {
  assert.deepEqual(paidField({ allowPaidStars: 30 }), { allowPaidStars: 30 });
  for (const bad of [0, -3, 1.5, '30', null, undefined, 2 ** 60, NaN]) {
    assert.deepEqual(paidField({ allowPaidStars: bad }), {}, String(bad));
    assert.equal(validPaidStars(bad), false);
  }
  assert.deepEqual(paidField(undefined), {});
});

test('a send request carries the confirmed Stars and never another number', async () => {
  const seen = [];
  const client = {
    invoke: async (request) => seen.push(request),
    getInputEntity: async () => 'peer',
    sendFile(peer, options) {
      return this.invoke(new Api.messages.SendMedia({ peer, ...options }));
    },
  };
  const env = { connection: { withPeer: (_c, _chat, use) => use('p') } };
  for (const confirmed of [1, 3, 250, 9999]) {
    seen.length = 0;
    const paid = await withSendAs(env, client, undefined, confirmed);
    await paid.invoke(new Api.messages.SendMessage({}));
    await paid.invoke(new Api.messages.SendMedia({}));
    await paid.invoke(new Api.messages.ForwardMessages({}));
    await paid.sendFile('p', { file: 1 });
    assert.deepEqual(
      seen.map((r) => r.allowPaidStars),
      [confirmed, confirmed, confirmed, confirmed]
    );
  }
  // Not a send: untouched. A request that names its own: left alone.
  seen.length = 0;
  const paid = await withSendAs(env, client, undefined, 40);
  await paid.invoke(new Api.users.GetRequirementsToContact({}));
  await paid.invoke(new Api.messages.SendMessage({ allowPaidStars: 5 }));
  assert.deepEqual(
    seen.map((r) => r.allowPaidStars),
    [undefined, 5]
  );
  // Nothing confirmed (or something that is no total): no stamp at all.
  for (const none of [undefined, 0, -1, 2.5, '7']) {
    assert.equal(await withSendAs(env, client, undefined, none), client);
  }
});

test('text and its long parts all go out with the confirmed total, nothing else', async () => {
  const log = [];
  const client = {
    invoke: async (request) => {
      log.push(request);
      return { className: 'UpdateShortSentMessage', id: 5, date: 1 };
    },
    getInputEntity: async (peer) => peer,
  };
  const env = { connection: { withPeer: (_c, _chat, use) => use('p') } };
  const paid = await withSendAs(env, client, undefined, 66);
  await sendText({
    client: paid,
    Api,
    peer: 'p',
    text: 'a'.repeat(30),
    maxLength: 10,
  });
  assert.equal(log.length, 3);
  assert.deepEqual(
    log.map((r) => r.allowPaidStars),
    [66, 66, 66]
  );
  log.length = 0;
  await sendText({ client, Api, peer: 'p', text: 'free chat' });
  assert.equal(log[0].allowPaidStars, undefined);
});

test('Telegram refusing a paid send is a code, and nothing is paid', () => {
  assert.equal(
    sendError(fail('ALLOW_PAYMENT_REQUIRED_7')).code,
    'paid-required'
  );
  assert.equal(sendError(fail('BALANCE_TOO_LOW')).code, 'paid-balance');
  const t = (key) => key;
  assert.equal(
    failureText(t, { code: 'paid-required' }),
    'chat.paidSend.changed'
  );
  assert.equal(
    failureText(t, { code: 'paid-declined' }),
    'chat.paidSend.declined'
  );
  assert.equal(
    failureText(t, { code: 'paid-balance' }),
    'chat.paid.err.balance'
  );
});

test('routes pass a valid confirmed total on and drop anything else', async () => {
  const calls = [];
  const spy = (name) => async (body) => {
    calls.push([name, body]);
    return { ok: true };
  };
  const account = {
    forwardMessages: spy('forward'),
    sendDocument: spy('doc'),
    sendFiles: spy('files'),
    sendPoll: spy('poll'),
  };
  const token = 'a'.repeat(32);
  const cases = [
    ['forward', { fromChat: '1', toChat: '2', ids: [3] }],
    ['send-document', { chat: '2', id: '5' }],
    ['send-files', { chat: '2', tokens: [token] }],
  ];
  for (const [route, body] of cases) {
    assert.equal(
      await postRoute(route, { ...body, allowPaidStars: 12 }, account),
      200
    );
    assert.equal(calls.at(-1)[1].allowPaidStars, 12, route);
    for (const bad of [0, -1, 1.5, '12', 1e12]) {
      await postRoute(route, { ...body, allowPaidStars: bad }, account);
      assert.equal(
        'allowPaidStars' in calls.at(-1)[1],
        false,
        `${route} ${bad}`
      );
    }
    await postRoute(route, body, account);
    assert.equal('allowPaidStars' in calls.at(-1)[1], false, route);
  }
});

test('the paid routes validate before the account is asked', async () => {
  const calls = [];
  const spy = (name) => async (body) => {
    calls.push([name, body]);
    return { ok: true };
  };
  const account = {
    paidPrice: spy('price'),
    paidSettings: spy('settings'),
    paidSettingsSave: spy('save'),
    paidRevenue: spy('revenue'),
    paidException: spy('exception'),
    paidPriceSave: spy('group'),
    giveawayInfo: spy('giveaway'),
  };
  const bad = [
    ['paid-price', {}],
    ['paid-settings-save', { stars: -1 }],
    ['paid-settings-save', { stars: '5' }],
    ['paid-revenue', { user: 'x' }],
    ['paid-exception', { user: '4', allow: 'yes' }],
    ['paid-exception', { user: '4', allow: true, refund: 1 }],
    ['paid-price-save', { chat: '-5', stars: 3 }],
    ['paid-price-save', { chat: '-1001', stars: 99999 }],
    ['giveaway-info', { chat: '-1001', id: 0 }],
    ['giveaway-info', { chat: '-1001', id: 5, channels: ['x'] }],
    ['giveaway-info', { chat: '-1001', id: 5, winners: Array(101).fill('1') }],
  ];
  for (const [route, body] of bad) {
    assert.equal(
      await postRoute(route, body, account),
      400,
      `${route} ${JSON.stringify(body)}`
    );
  }
  assert.equal(calls.length, 0);
  const good = [
    ['paid-price', { chat: '42' }],
    ['paid-settings', {}],
    ['paid-settings-save', { stars: 0 }],
    ['paid-revenue', { user: '42' }],
    ['paid-exception', { user: '42', allow: false }],
    ['paid-price-save', { chat: '-1001', stars: 4 }],
    [
      'giveaway-info',
      { chat: '-1001', id: 9, channels: ['1'], winners: ['2'] },
    ],
  ];
  for (const [route, body] of good) {
    assert.equal(await postRoute(route, body, account), 200, route);
  }
  assert.equal(calls.length, good.length);
});

// ---- the page's gate ----------------------------------------------------------

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
};

// A gate over a price table, a scripted user, and an `api` that records.
const rig = ({ prices = {}, answers = [], storage = memoryStorage() } = {}) => {
  const asked = [];
  const sent = [];
  let clock = 0;
  const gate = createGate({
    price: async (chat) => prices[chat] ?? 0,
    ask: async (offer) => {
      asked.push(offer);
      return answers.shift() ?? { confirmed: false };
    },
    storage,
    now: () => clock,
  });
  const record = (name) => async (body) => {
    sent.push([name, body]);
    return { ok: true, status: 'sent' };
  };
  const api = guardApi(
    {
      sendMessage: record('sendMessage'),
      telegramSendFiles: record('files'),
      telegramSendDocument: record('sticker'),
      telegramForward: record('forward'),
      telegramSendVoice: record('voice'),
      other: () => 'untouched',
    },
    gate
  );
  return { api, gate, asked, sent, storage, tick: (ms) => (clock += ms) };
};

test('a free chat is not asked and carries no Stars', async () => {
  const { api, asked, sent } = rig();
  await api.sendMessage({ source: 'telegram', chat: '5', text: 'hi' });
  assert.equal(asked.length, 0);
  assert.equal('allowPaidStars' in sent[0][1], false);
  assert.equal(api.other(), 'untouched');
});

test('a paid chat asks first; confirming sends exactly price x messages', async () => {
  const { api, asked, sent } = rig({
    prices: { 42: 10 },
    answers: [{ confirmed: true }],
  });
  const answer = await api.sendMessage({
    source: 'telegram',
    chat: '42',
    text: 'x'.repeat(4096 * 2 + 1),
  });
  assert.equal(answer.ok, true);
  assert.deepEqual(asked, [{ chat: '42', price: 10, count: 3, total: 30 }]);
  assert.equal(sent[0][1].allowPaidStars, 30);
});

test('declining or closing the question sends nothing and pays nothing', async () => {
  const { api, asked, sent } = rig({
    prices: { 42: 10 },
    answers: [{ confirmed: false }],
  });
  const answer = await api.telegramSendDocument({ chat: '42', id: '5' });
  assert.deepEqual(answer, DECLINED);
  assert.equal(answer.code, 'paid-declined');
  assert.equal(sent.length, 0);
  assert.equal(asked.length, 1);
  // No one to answer at all (the page is gone): also no.
  const silent = rig({ prices: { 42: 10 } });
  const none = await silent.api.telegramSendVoice({ chat: '42', token: 't' });
  assert.equal(none.code, 'paid-declined');
  assert.equal(silent.sent.length, 0);
});

test('a send never carries a total other than the confirmed one', async () => {
  const { api, sent } = rig({
    prices: { 42: 7 },
    answers: [{ confirmed: true }, { confirmed: true }, { confirmed: true }],
  });
  // The caller cannot slip its own number in.
  await api.telegramSendDocument({ chat: '42', id: '5', allowPaidStars: 1 });
  await api.telegramForward({ fromChat: '1', toChat: '42', ids: [1, 2, 3, 4] });
  await api.telegramSendFiles({ chat: '42', tokens: ['a', 'b'] });
  assert.deepEqual(
    sent.map(([, body]) => body.allowPaidStars),
    [7, 28, 14]
  );
  for (const [name, body] of sent) {
    assert.equal(body.allowPaidStars % 7, 0, name);
  }
});

test('a forward is priced by the chat it goes to and by how many messages', async () => {
  const { api, asked, sent } = rig({
    prices: { 1: 100, 42: 3 },
    answers: [{ confirmed: true }],
  });
  await api.telegramForward({ fromChat: '1', toChat: '42', ids: [1, 2] });
  assert.equal(asked[0].chat, '42');
  assert.equal(asked[0].total, 6);
  assert.equal(sent[0][1].allowPaidStars, 6);
});

test("'don't ask again' is kept for that chat at that price only", async () => {
  const prices = { 42: 5 };
  const storage = memoryStorage();
  const first = rig({
    prices,
    answers: [{ confirmed: true, remember: true }],
    storage,
  });
  await first.api.sendMessage({ source: 'telegram', chat: '42', text: 'a' });
  assert.equal(first.asked.length, 1);
  assert.equal(isSilenced(readPrefs(storage), '42', 5), true);
  // Later: no question, but still exactly price x messages.
  const again = rig({ prices, storage });
  await again.api.sendMessage({ source: 'telegram', chat: '42', text: 'b' });
  assert.equal(again.asked.length, 0);
  assert.equal(again.sent[0][1].allowPaidStars, 5);
  // Another chat is asked.
  const other = rig({ prices: { 42: 5, 43: 5 }, storage });
  await other.api.sendMessage({ source: 'telegram', chat: '43', text: 'c' });
  assert.equal(other.asked.length, 1);
  assert.equal(other.sent.length, 0);
  // The price went up: asked again, and the old answer is not used.
  const dearer = rig({ prices: { 42: 6 }, storage });
  await dearer.api.sendMessage({ source: 'telegram', chat: '42', text: 'd' });
  assert.equal(dearer.asked.length, 1);
  assert.equal(dearer.sent.length, 0);
});

test('without "remember" the next send asks again', async () => {
  const { api, asked } = rig({
    prices: { 42: 2 },
    answers: [{ confirmed: true }, { confirmed: true }],
  });
  await api.sendMessage({ source: 'telegram', chat: '42', text: 'a' });
  await api.sendMessage({ source: 'telegram', chat: '42', text: 'b' });
  assert.equal(asked.length, 2);
});

test('other networks and calls the gate does not know pass straight through', async () => {
  const { api, asked, sent } = rig({ prices: { 42: 9 } });
  await api.sendMessage({ source: 'signal', chat: '42', text: 'x' });
  assert.equal(asked.length, 0);
  assert.equal('allowPaidStars' in sent[0][1], false);
  assert.equal(chatOf('sendMessage', { source: 'vk', chat: '1' }), null);
  assert.equal(chatOf('telegramForward', { toChat: 9 }), '9');
  assert.equal(chatOf('sendMessage', {}), null);
});

test('the price is read once and again after it changes', async () => {
  let reads = 0;
  const gate = createGate({
    price: async () => {
      reads += 1;
      return 4;
    },
    ask: async () => ({ confirmed: true }),
    storage: memoryStorage(),
    now: () => 0,
  });
  await gate.confirm('42', 1);
  await gate.confirm('42', 1);
  assert.equal(reads, 1);
  gate.forget('42');
  await gate.confirm('42', 1);
  assert.equal(reads, 2);
  // A price that cannot be read is free: Telegram refuses an unpaid send.
  const broken = createGate({
    price: async () => {
      throw new Error('offline');
    },
    ask: async () => assert.fail('no question'),
    storage: memoryStorage(),
  });
  assert.deepEqual(await broken.confirm('42', 2), { ok: true, stars: 0 });
});

test('a refusal because the price changed makes the next send read it again', async () => {
  let price = 3;
  let reads = 0;
  const gate = createGate({
    price: async () => {
      reads += 1;
      return price;
    },
    ask: async () => ({ confirmed: true }),
    storage: memoryStorage(),
    now: () => 0,
  });
  const api = guardApi(
    { sendMessage: async () => ({ status: 'failed', code: 'paid-required' }) },
    gate
  );
  await api.sendMessage({ source: 'telegram', chat: '42', text: 'a' });
  price = 8;
  await api.sendMessage({ source: 'telegram', chat: '42', text: 'b' });
  assert.equal(reads, 2);
});

test('the page helpers: totals, parts, counts, prefs, who may charge', () => {
  assert.equal(totalOf(5, 3), 15);
  assert.equal(totalOf(5, 0), 5);
  assert.equal(totalOf(-5, 2), 0);
  assert.equal(textParts(''), 1);
  assert.equal(textParts('a'.repeat(4096)), 1);
  assert.equal(textParts('a'.repeat(4097)), 2);
  assert.equal(countOf('telegramForward', { ids: [1, 2, 3] }), 3);
  assert.equal(countOf('telegramSendFiles', { tokens: ['a', 'b'] }), 2);
  assert.equal(countOf('telegramSendVoice', {}), 1);
  const prefs = silenced({}, 42, 5);
  assert.equal(isSilenced(prefs, '42', 5), true);
  assert.equal(isSilenced(prefs, '42', 6), false);
  assert.equal(isSilenced(prefs, '42', 0), false);
  const storage = memoryStorage();
  storage.setItem(PAID_PREFS_KEY, '[1,2]');
  assert.deepEqual(readPrefs(storage), {});
  storage.setItem(PAID_PREFS_KEY, 'not json');
  assert.deepEqual(readPrefs(storage), {});
  const tg = (chat, extra = {}) => ({ source: 'telegram', chat, ...extra });
  assert.equal(mayCharge(tg('42')), true);
  assert.equal(mayCharge(tg('-1001234')), true);
  assert.equal(mayCharge(tg('-5')), false);
  assert.equal(mayCharge(tg('-1001234', { kind: 'channel' })), false);
  assert.equal(mayCharge({ source: 'vk', chat: '42' }), false);
  assert.equal(isPerson(tg('42')), true);
  assert.equal(isPerson(tg('-1001')), false);
});

test('the price typed in Privacy is a whole number from 1 to the limit', () => {
  assert.equal(priceOf('25'), 25);
  assert.equal(priceOf(' 10000 '), PRICE_MAX);
  for (const bad of ['0', '', '1.5', '-3', '10001', 'abc', '1e3', null]) {
    assert.equal(priceOf(bad), null, String(bad));
  }
});
