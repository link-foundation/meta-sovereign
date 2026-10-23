// Stickers and emoji settings, close friends and adding a contact by phone
// (R-Y169): the two source modules with a fake client, the route
// validation and the page's pure helpers. Nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStickerSets } from '../src/sources/telegram-sticker-sets.js';
import {
  contactOf,
  createContactsEdit,
  idsOf,
} from '../src/sources/telegram-contacts-edit.js';
import { createStickers } from '../src/sources/telegram-stickers.js';
import { validContact } from '../src/server/routes-telegram-sticker-settings.js';
import {
  countKey,
  moveItem,
  orderIds,
} from '../src/web/sticker-settings-model.js';
import {
  closeIds,
  outcomeOf,
  validForm,
} from '../src/web/chat-contacts-edit.js';
import { named, postRoute } from './helpers/telegram-route.js';

const API = {
  InputStickerSetID: named('InputStickerSetID'),
  InputPhoneContact: named('InputPhoneContact'),
  messages: Object.fromEntries(
    [
      'GetAllStickers',
      'GetEmojiStickers',
      'GetArchivedStickers',
      'ReorderStickerSets',
      'InstallStickerSet',
      'UninstallStickerSet',
    ].map((n) => [n, named(`messages.${n}`)])
  ),
  contacts: Object.fromEntries(
    ['GetContacts', 'EditCloseFriends', 'ImportContacts'].map((n) => [
      n,
      named(`contacts.${n}`),
    ])
  ),
};

const makeEnv = (answers) => {
  const log = [];
  const env = {
    queue: { run: async (_k, _p, fn) => fn() },
    importer: async () => ({
      Api: API,
      helpers: {
        returnBigInt: BigInt,
        readBigIntFromBuffer: (b) => BigInt(b[0] + 1),
      },
    }),
    peers: { remember: (...args) => log.push(['remember', ...args]) },
  };
  const userClient = async () => ({
    invoke: async (request) => {
      log.push(request);
      const answer = answers[request.className];
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'function' ? answer(request) : (answer ?? true);
    },
  });
  return { env, userClient, log };
};

const set = (id, extra = {}) => ({
  id: BigInt(id),
  accessHash: 7n,
  title: `Set ${id}`,
  count: 3,
  ...extra,
});

const makeSets = (answers) => {
  const { env, userClient, log } = makeEnv(answers);
  const known = new Map();
  let changed = 0;
  const actions = createStickerSets(env, {
    userClient,
    stickers: {
      learn: (s) => known.set(String(s.id), s),
      known: (id) => known.get(id) ?? null,
      changed: () => (changed += 1),
    },
  });
  return { actions, log, known, changes: () => changed };
};

test('setsList: sets in order, only the asked kind, learned for later', async () => {
  const { actions, log, known } = makeSets({
    'messages.GetAllStickers': {
      sets: [set(2), set(1, { official: true }), set(9, { emojis: true })],
    },
    'messages.GetEmojiStickers': { sets: [set(9, { emojis: true })] },
  });
  const stickers = await actions.setsList();
  assert.deepEqual(
    stickers.sets.map((s) => s.id),
    ['2', '1']
  );
  assert.equal(stickers.sets[1].official, true);
  assert.equal(known.size, 2);
  const emoji = await actions.setsList({ emojis: true });
  assert.equal(emoji.sets[0].emoji, true);
  assert.equal(log.at(-1).className, 'messages.GetEmojiStickers');
});

test('setsReorder: the order as bigints, emojis flag, strict ids', async () => {
  const { actions, log, changes } = makeSets({});
  assert.deepEqual(await actions.setsReorder({ ids: ['3', '-1', '2'] }), {
    ok: true,
  });
  assert.deepEqual(log[0].order, [3n, -1n, 2n]);
  assert.equal(log[0].emojis, undefined);
  await actions.setsReorder({ ids: ['5'], emojis: true });
  assert.equal(log[1].emojis, true);
  assert.equal(changes(), 2);
  for (const ids of [[], ['1', '1'], ['x'], 'nope', ['1;2']]) {
    assert.equal((await actions.setsReorder({ ids })).code, 'bad-request');
  }
  const many = Array.from({ length: 1001 }, (_, i) => String(i));
  assert.equal((await actions.setsReorder({ ids: many })).code, 'bad-request');
  assert.equal(log.length, 2);
});

test('archive, add and remove: the right request for a known set', async () => {
  const { actions, log, known, changes } = makeSets({});
  known.set('4', set(4));
  assert.equal((await actions.setArchive({ id: '4' })).ok, true);
  assert.equal(log[0].className, 'messages.InstallStickerSet');
  assert.equal(log[0].archived, true);
  assert.equal(log[0].stickerset.id, 4n);
  await actions.setAdd({ id: '4' });
  assert.equal(log[1].archived, false);
  await actions.setRemove({ id: '4' });
  assert.equal(log[2].className, 'messages.UninstallStickerSet');
  assert.equal(changes(), 3);
  assert.equal((await actions.setRemove({ id: '5' })).code, 'unknown-set');
  assert.equal((await actions.setRemove({ id: 'a' })).code, 'bad-request');
  assert.equal(log.length, 3);
});

test('a set Telegram did not change is no failure; other errors are codes', async () => {
  const same = Object.assign(new Error('x'), {
    errorMessage: 'STICKERSET_NOT_MODIFIED',
  });
  const bad = Object.assign(new Error('x'), {
    errorMessage: 'STICKERSET_INVALID',
  });
  const a = makeSets({ 'messages.InstallStickerSet': same });
  a.known.set('4', set(4));
  assert.equal((await a.actions.setArchive({ id: '4' })).ok, true);
  const b = makeSets({ 'messages.UninstallStickerSet': bad });
  b.known.set('4', set(4));
  assert.equal((await b.actions.setRemove({ id: '4' })).code, 'unknown-set');
});

test('archivedList: covered sets paged, next when the page is full', async () => {
  const { actions, log, known } = makeSets({
    'messages.GetArchivedStickers': {
      count: 3,
      sets: [{ set: set(8) }, { set: set(7) }],
    },
  });
  const page = await actions.archivedList({ limit: 2, offsetId: '9' });
  assert.deepEqual(
    page.sets.map((s) => s.id),
    ['8', '7']
  );
  assert.equal(page.count, 3);
  assert.equal(page.next, '7');
  assert.equal(log[0].offsetId, 9n);
  assert.equal(log[0].limit, 2);
  assert.equal(known.size, 2);
  const last = await actions.archivedList({ limit: 5, emojis: true });
  assert.equal(last.next, null);
  assert.equal(log[1].emojis, true);
  assert.equal((await actions.archivedList({ limit: 0 })).code, 'bad-request');
  assert.equal(
    (await actions.archivedList({ offsetId: 'x' })).code,
    'bad-request'
  );
});

test('createStickers shares its set list with the settings', async () => {
  const { env, userClient } = makeEnv({
    'messages.GetAllStickers': { sets: [set(6)] },
  });
  env.importer = async () => ({
    Api: {
      ...API,
      messages: {
        ...API.messages,
        GetRecentStickers: named('r'),
        GetFavedStickers: named('f'),
      },
    },
    helpers: { returnBigInt: BigInt },
  });
  const { stickerLists, stickerPanel } = createStickers(env, {
    userClient,
    apply: async () => {},
  });
  assert.equal(stickerLists.known('6'), null);
  await stickerPanel();
  assert.equal(stickerLists.known('6').title, 'Set 6');
  stickerLists.learn(set(12));
  assert.equal(stickerLists.known('12').id, 12n);
  stickerLists.changed();
});

test('closeFriends: contacts with the flag, not me or bots', async () => {
  const { env, userClient } = makeEnv({
    'contacts.GetContacts': {
      users: [
        { id: 2n, firstName: 'Zed', closeFriend: true },
        { id: 1n, firstName: 'Amy', lastName: 'Lee', username: 'amy' },
        { id: 3n, self: true, firstName: 'Me' },
        { id: 4n, bot: true, firstName: 'Bot' },
      ],
    },
  });
  const { closeFriends } = createContactsEdit(env, { userClient });
  const answer = await closeFriends();
  assert.deepEqual(answer.contacts, [
    { id: '1', name: 'Amy Lee', username: 'amy', closeFriend: false },
    { id: '2', name: 'Zed', username: null, closeFriend: true },
  ]);
  assert.deepEqual(closeIds(answer.contacts), ['2']);
});

test('closeFriendsSet: exactly the ids, bigints, empty clears, strict', async () => {
  const { env, userClient, log } = makeEnv({});
  const { closeFriendsSet } = createContactsEdit(env, { userClient });
  assert.deepEqual(await closeFriendsSet({ ids: ['5', '6', '5'] }), {
    ok: true,
    count: 2,
  });
  assert.deepEqual(log[0].id, [5n, 6n]);
  assert.equal((await closeFriendsSet({ ids: [] })).ok, true);
  assert.deepEqual(log[1].id, []);
  assert.equal((await closeFriendsSet({ ids: ['x'] })).code, 'bad-request');
  assert.equal((await closeFriendsSet({})).code, 'bad-request');
  assert.equal(idsOf(Array.from({ length: 1001 }, (_, i) => `${i}`)), null);
  assert.equal(
    idsOf(Array.from({ length: 1000 }, (_, i) => `${i}`)).length,
    1000
  );
});

test('contactImport: found, not on Telegram, invalid input', async () => {
  const known = {
    imported: [{ userId: 77n, clientId: 1n }],
    users: [{ id: 77n, firstName: 'Ann', lastName: 'Lee', username: 'ann' }],
  };
  const a = makeEnv({ 'contacts.ImportContacts': known });
  const found = await createContactsEdit(a.env, {
    userClient: a.userClient,
  }).contactImport({
    phone: '+1 555 123 4567',
    firstName: ' Ann ',
    lastName: 'Lee',
  });
  assert.deepEqual(found, {
    ok: true,
    found: true,
    contact: { id: '77', name: 'Ann Lee', username: 'ann' },
    chat: '77',
  });
  const sent = a.log[0].contacts[0];
  assert.equal(sent.phone, '+15551234567');
  assert.equal(sent.firstName, 'Ann');
  assert.equal(typeof sent.clientId, 'bigint');
  assert.equal(a.log.at(-1)[0], 'remember');
  const b = makeEnv({
    'contacts.ImportContacts': { imported: [], users: [] },
  });
  const none = await createContactsEdit(b.env, {
    userClient: b.userClient,
  }).contactImport({ phone: '+15550000000', firstName: 'Bob' });
  assert.deepEqual(none, { ok: true, found: false });
  assert.equal(b.log.length, 1);
  const { contactImport } = createContactsEdit(b.env, {
    userClient: b.userClient,
  });
  for (const body of [
    { phone: '15551234567', firstName: 'A' },
    { phone: '+1234', firstName: 'A' },
    { phone: '+123456789012345678901', firstName: 'A' },
    { phone: '+15551234567', firstName: '  ' },
    { phone: '+15551234567', firstName: 'x'.repeat(65) },
    { phone: '+15551234567', firstName: 'A', lastName: 'y'.repeat(65) },
  ]) {
    assert.equal((await contactImport(body)).ok, false);
  }
  assert.equal(b.log.length, 1);
});

test('contactOf and validContact agree on what is acceptable', () => {
  const good = { phone: '+44 (20) 7946-0958', firstName: 'A', lastName: '' };
  assert.equal(contactOf(good).phone, '+442079460958');
  assert.equal(validContact(good), true);
  assert.equal(validContact({ ...good, phone: '442079460958' }), false);
  assert.equal(validContact({ ...good, firstName: 5 }), false);
  assert.equal(validContact({ ...good, lastName: 'z'.repeat(65) }), false);
  assert.equal(validContact({ ...good, lastName: 'z'.repeat(64) }), true);
});

test('routes: validated before the account is asked', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, name) => async (arg) => {
        calls.push([name, arg]);
        return { ok: true };
      },
    }
  );
  const post = (route, body) => postRoute(route, body, account);
  assert.equal(await post('sticker-sets', { emojis: true }), 200);
  assert.equal(await post('sticker-sets', { emojis: 'yes' }), 400);
  assert.equal(await post('sticker-sets-reorder', { ids: ['1', '2'] }), 200);
  assert.equal(await post('sticker-sets-reorder', { ids: [] }), 400);
  assert.equal(await post('sticker-set-archive', { id: '12' }), 200);
  assert.equal(await post('sticker-set-remove', { id: 'a' }), 400);
  assert.equal(await post('sticker-set-add', {}), 400);
  assert.equal(await post('sticker-sets-archived', { limit: 20 }), 200);
  assert.equal(await post('sticker-sets-archived', { limit: 101 }), 400);
  assert.equal(await post('close-friends', {}), 200);
  assert.equal(await post('close-friends-set', { ids: ['3'] }), 200);
  assert.equal(await post('close-friends-set', { ids: [3] }), 200);
  assert.equal(await post('close-friends-set', { ids: ['3a'] }), 400);
  assert.equal(await post('close-friends-set', { ids: 'all' }), 400);
  assert.equal(
    await post('contact-import', { phone: '+15551234567', firstName: 'A' }),
    200
  );
  assert.equal(
    await post('contact-import', { phone: '5551234567', firstName: 'A' }),
    400
  );
  assert.deepEqual(calls.find(([n]) => n === 'closeFriendsSet')[1], {
    ids: ['3'],
  });
  assert.equal(await postRoute('sticker-sets', {}, {}), 400);
});

test('page helpers: moving, ids, labels, the add-contact form', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  const list = ['a', 'b'];
  assert.equal(moveItem(list, 0, -1), list);
  assert.equal(moveItem(list, 1, 5), list);
  assert.equal(moveItem(list, 7, 0), list);
  assert.deepEqual(orderIds([{ id: 4 }, { id: '5' }]), ['4', '5']);
  assert.match(countKey({ emoji: true }), /emojiCount/);
  assert.match(countKey({ emoji: false }), /count$/);
  assert.equal(
    validForm({ firstName: 'A', lastName: '', phone: '+1 555 12' }),
    true
  );
  assert.equal(
    validForm({ firstName: '', lastName: '', phone: '+15551234' }),
    false
  );
  assert.equal(
    validForm({ firstName: 'A', lastName: '', phone: '5551234' }),
    false
  );
  assert.equal(outcomeOf({ ok: true, found: false }).kind, 'notFound');
  assert.equal(
    outcomeOf({ ok: true, found: true, contact: { name: 'A' }, chat: '1' })
      .kind,
    'added'
  );
  assert.equal(outcomeOf({ ok: false, code: 'flood' }).code, 'flood');
});
