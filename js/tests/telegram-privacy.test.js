// Privacy and security (R-Y139): the rules read and written with the
// exceptions kept, the sessions, terminating one or the others, the
// blocked users in pages and unblocked, Telegram's errors as codes, the
// pure page helpers and the routes' validation. Fake clients; no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createPrivacy,
  choiceOf,
  PRIVACY_KEYS,
} from '../src/sources/telegram-privacy.js';
import { visibleKeys } from '../src/web/chat-privacy.js';
import {
  named,
  helpers,
  telegramError,
  fakeClient,
  post,
} from './helpers/telegram-fakes.mjs';

const keyClasses = Object.values(PRIVACY_KEYS);
const Api = {
  InputUser: named('InputUser'),
  InputPeerUser: named('InputPeerUser'),
  InputPrivacyValueAllowAll: named('InputPrivacyValueAllowAll'),
  InputPrivacyValueAllowContacts: named('InputPrivacyValueAllowContacts'),
  InputPrivacyValueDisallowAll: named('InputPrivacyValueDisallowAll'),
  InputPrivacyValueAllowUsers: named('InputPrivacyValueAllowUsers'),
  InputPrivacyValueDisallowUsers: named('InputPrivacyValueDisallowUsers'),
  InputPrivacyValueAllowChatParticipants: named(
    'InputPrivacyValueAllowChatParticipants'
  ),
  InputPrivacyValueDisallowChatParticipants: named(
    'InputPrivacyValueDisallowChatParticipants'
  ),
  InputPrivacyValueAllowBots: named('InputPrivacyValueAllowBots'),
  InputPrivacyValueDisallowBots: named('InputPrivacyValueDisallowBots'),
  ...Object.fromEntries(keyClasses.map((k) => [k, named(k)])),
  account: {
    GetPrivacy: named('GetPrivacy'),
    SetPrivacy: named('SetPrivacy'),
    GetAuthorizations: named('GetAuthorizations'),
    ResetAuthorization: named('ResetAuthorization'),
  },
  auth: { ResetAuthorizations: named('ResetAuthorizations') },
  contacts: { GetBlocked: named('GetBlocked'), Unblock: named('Unblock') },
};

const rule = (className, fields = {}) => ({ className, ...fields });
const make = (answer) => {
  const log = [];
  const env = { importer: async () => ({ Api, helpers }) };
  const actions = createPrivacy(env, {
    userClient: async () => fakeClient(answer, log),
  });
  return { actions, log };
};
const rules = (list, users = []) => ({
  className: 'account.PrivacyRules',
  rules: list,
  users,
  chats: [],
});

test('every Api name the module uses is in layer 225', () => {
  const tl = readFileSync(
    new URL('../src/sources/telegram-api/layer-225.tl', import.meta.url),
    'utf8'
  );
  const lower = (s) => s[0].toLowerCase() + s.slice(1);
  for (const name of Object.keys(Api).filter((n) => /^Input/.test(n))) {
    assert.ok(tl.includes(`${lower(name)}#`), name);
  }
  for (const method of [
    'account.getPrivacy',
    'account.setPrivacy',
    'account.getAuthorizations',
    'account.resetAuthorization',
    'auth.resetAuthorizations',
    'contacts.getBlocked',
    'contacts.unblock',
  ]) {
    assert.ok(tl.includes(`\n${method}#`), method);
  }
});

test('rules map to a choice, a label and the exception counts', () => {
  const some = {
    allow: 2,
    disallow: 1,
  };
  assert.deepEqual(
    choiceOf([
      rule('PrivacyValueAllowUsers', { users: [1n, 2n] }),
      rule('PrivacyValueDisallowChatParticipants', { chats: [3n] }),
      rule('PrivacyValueAllowAll'),
    ]),
    { choice: 'everybody', label: null, ...some }
  );
  assert.equal(
    choiceOf([rule('PrivacyValueAllowContacts')]).choice,
    'contacts'
  );
  assert.equal(choiceOf([rule('PrivacyValueDisallowAll')]).choice, 'nobody');
  assert.equal(choiceOf([]).choice, 'nobody');
  const close = choiceOf([
    rule('PrivacyValueAllowCloseFriends'),
    rule('PrivacyValueDisallowAll'),
  ]);
  assert.deepEqual([close.choice, close.label], ['other', 'close-friends']);
  assert.equal(choiceOf([rule('PrivacyValueAllowPremium')]).label, 'premium');
  assert.equal(
    choiceOf([
      rule('PrivacyValueDisallowContacts'),
      rule('PrivacyValueAllowAll'),
    ]).label,
    'except-contacts'
  );
});

test('privacyRules reads each key', async () => {
  const { actions, log } = make(() => rules([rule('PrivacyValueAllowAll')]));
  const read = await actions.privacyRules();
  assert.equal(read.ok, true);
  assert.equal(read.keys.length, Object.keys(PRIVACY_KEYS).length);
  assert.deepEqual(
    log.map((r) => r.key.className),
    keyClasses
  );
  assert.deepEqual(read.keys[0].options, ['everybody', 'contacts', 'nobody']);
  assert.deepEqual(read.keys.find((k) => k.key === 'addedByPhone').options, [
    'everybody',
    'contacts',
  ]);
});

test('privacyRules: one key failing leaves the rest; all failing is an error', async () => {
  const some = make((r) =>
    r.key.className === 'InputPrivacyKeyBirthday'
      ? telegramError('PRIVACY_KEY_INVALID')
      : rules([rule('PrivacyValueAllowContacts')])
  );
  const read = await some.actions.privacyRules();
  assert.equal(read.keys.length, Object.keys(PRIVACY_KEYS).length - 1);
  const none = make(() => telegramError('FLOOD_WAIT_9'));
  assert.equal((await none.actions.privacyRules()).code, 'flood');
});

test('setPrivacy keeps the exceptions, as inputs, and the choice is last', async () => {
  const current = rules(
    [
      rule('PrivacyValueAllowUsers', { users: [11n] }),
      rule('PrivacyValueDisallowUsers', { users: [12n, 11n] }),
      rule('PrivacyValueAllowChatParticipants', { chats: [5n] }),
      rule('PrivacyValueDisallowChatParticipants', { chats: [6n] }),
      rule('PrivacyValueDisallowBots'),
      rule('PrivacyValueAllowCloseFriends'),
      rule('PrivacyValueAllowAll'),
    ],
    [
      { id: 11n, accessHash: 111n },
      { id: 12n, accessHash: 122n },
    ]
  );
  const { actions, log } = make((r) =>
    r.className === 'GetPrivacy'
      ? current
      : rules([rule('PrivacyValueAllowContacts')])
  );
  const done = await actions.setPrivacy({
    key: 'lastSeen',
    choice: 'contacts',
  });
  assert.deepEqual(
    [done.ok, done.key, done.choice],
    [true, 'lastSeen', 'contacts']
  );
  const [get, set] = log;
  assert.equal(get.key.className, 'InputPrivacyKeyStatusTimestamp');
  assert.equal(set.className, 'SetPrivacy');
  assert.equal(set.key.className, 'InputPrivacyKeyStatusTimestamp');
  assert.deepEqual(
    set.rules.map((r) => r.className),
    [
      'InputPrivacyValueAllowUsers',
      'InputPrivacyValueDisallowUsers',
      'InputPrivacyValueAllowChatParticipants',
      'InputPrivacyValueDisallowChatParticipants',
      'InputPrivacyValueDisallowBots',
      'InputPrivacyValueAllowContacts',
    ]
  );
  assert.deepEqual(
    set.rules[1].users.map((u) => [u.className, u.userId, u.accessHash]),
    [
      ['InputUser', 12n, 122n],
      ['InputUser', 11n, 111n],
    ]
  );
  assert.deepEqual(set.rules[2].chats, [5n]);
  assert.deepEqual(set.rules[3].chats, [6n]);
});

test('setPrivacy for each choice ends in its base rule', async () => {
  const ends = {};
  for (const choice of ['everybody', 'contacts', 'nobody']) {
    const { actions, log } = make(() => rules([]));
    await actions.setPrivacy({ key: 'calls', choice });
    ends[choice] = log[1].rules.at(-1).className;
  }
  assert.deepEqual(ends, {
    everybody: 'InputPrivacyValueAllowAll',
    contacts: 'InputPrivacyValueAllowContacts',
    nobody: 'InputPrivacyValueDisallowAll',
  });
});

test('setPrivacy refuses what cannot keep its exceptions, and bad input', async () => {
  const unknown = make(() =>
    rules([rule('PrivacyValueAllowUsers', { users: [9n] })], [])
  );
  const refused = await unknown.actions.setPrivacy({
    key: 'about',
    choice: 'nobody',
  });
  assert.equal(refused.code, 'exceptions-unsupported');
  assert.equal(unknown.log.length, 1, 'only the read; nothing written');
  const { actions, log } = make(() => rules([]));
  assert.equal(
    (await actions.setPrivacy({ key: 'nope', choice: 'nobody' })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.setPrivacy({ key: 'about', choice: 'x' })).code,
    'bad-request'
  );
  assert.equal(
    (await actions.setPrivacy({ key: 'addedByPhone', choice: 'nobody' })).ok,
    false
  );
  assert.equal(log.length, 0);
});

test('setPrivacy maps Telegram errors', async () => {
  const { actions } = make((r) =>
    r.className === 'GetPrivacy' ? rules([]) : telegramError('PRIVACY_TOO_LONG')
  );
  assert.equal(
    (await actions.setPrivacy({ key: 'about', choice: 'nobody' })).code,
    'privacy-too-long'
  );
});

const auth = (hash, extra = {}) => ({
  hash,
  deviceModel: 'Pixel',
  platform: 'Android',
  systemVersion: '14',
  appName: 'Telegram',
  appVersion: '10.1',
  ip: '1.2.3.4',
  country: 'NL',
  region: 'NH',
  dateCreated: 1_700_000_000,
  dateActive: 1_700_003_600,
  ...extra,
});

test('sessions: shape, the current one marked, the auto-terminate period', async () => {
  const { actions, log } = make(() => ({
    authorizationTtlDays: 180,
    authorizations: [
      auth(1n, { current: true }),
      auth(2n, { unconfirmed: true }),
    ],
  }));
  const got = await actions.sessions();
  assert.equal(log[0].className, 'GetAuthorizations');
  assert.equal(got.ttlDays, 180);
  assert.deepEqual(got.sessions[0], {
    hash: '1',
    current: true,
    official: false,
    pending: false,
    device: 'Pixel',
    platform: 'Android',
    system: '14',
    app: 'Telegram',
    appVersion: '10.1',
    ip: '1.2.3.4',
    country: 'NL',
    region: 'NH',
    created: '2023-11-14T22:13:20.000Z',
    active: '2023-11-14T23:13:20.000Z',
  });
  assert.equal(got.sessions[1].pending, true);
});

test('terminateSession resets by hash, never the current one', async () => {
  const list = {
    authorizationTtlDays: 180,
    authorizations: [auth(1n, { current: true }), auth(2n)],
  };
  const { actions, log } = make((r) =>
    r.className === 'GetAuthorizations' ? list : true
  );
  assert.deepEqual(await actions.terminateSession({ hash: '2' }), { ok: true });
  const reset = log.find((r) => r.className === 'ResetAuthorization');
  assert.equal(reset.hash, 2n);
  const before = log.length;
  assert.equal(
    (await actions.terminateSession({ hash: '1' })).code,
    'current-session'
  );
  assert.equal(
    log.slice(before).some((r) => r.className === 'ResetAuthorization'),
    false
  );
  assert.equal(
    (await actions.terminateSession({ hash: 'x' })).code,
    'bad-request'
  );
});

test('terminate errors become codes', async () => {
  const fresh = make((r) =>
    r.className === 'GetAuthorizations'
      ? { authorizations: [auth(2n)] }
      : telegramError('FRESH_RESET_AUTHORISATION_FORBIDDEN')
  );
  assert.equal(
    (await fresh.actions.terminateSession({ hash: '2' })).code,
    'fresh-reset'
  );
  const hash = make((r) =>
    r.className === 'GetAuthorizations'
      ? { authorizations: [] }
      : telegramError('HASH_INVALID')
  );
  assert.equal(
    (await hash.actions.terminateSession({ hash: '5' })).code,
    'hash-invalid'
  );
  const others = make(() =>
    telegramError('FRESH_RESET_AUTHORISATION_FORBIDDEN')
  );
  assert.equal((await others.actions.terminateOthers()).code, 'fresh-reset');
});

test('terminateOthers calls auth.resetAuthorizations', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.terminateOthers(), { ok: true });
  assert.equal(log[0].className, 'ResetAuthorizations');
});

test('blockedUsers pages with offset and limit; next is the following offset', async () => {
  const user = (id, firstName, extra = {}) => ({
    id,
    firstName,
    accessHash: id * 10n,
    ...extra,
  });
  const blocked = (id) => ({ peerId: { className: 'PeerUser', userId: id } });
  const { actions, log } = make((r) => ({
    className: 'contacts.BlockedSlice',
    count: 3,
    blocked: r.offset === 0 ? [blocked(1n), blocked(2n)] : [blocked(3n)],
    users:
      r.offset === 0
        ? [
            user(1n, 'Ann', { lastName: 'Lee' }),
            user(2n, '', { username: 'bob' }),
          ]
        : [user(3n, 'Cy')],
  }));
  const first = await actions.blockedUsers({ offset: 0, limit: 2 });
  assert.deepEqual([log[0].offset, log[0].limit], [0, 2]);
  assert.deepEqual(first, {
    ok: true,
    count: 3,
    items: [
      { id: '1', accessHash: '10', name: 'Ann Lee', username: '' },
      { id: '2', accessHash: '20', name: 'bob', username: 'bob' },
    ],
    next: 2,
  });
  const last = await actions.blockedUsers({ offset: 2, limit: 2 });
  assert.equal(last.next, null);
  assert.equal(last.items[0].name, 'Cy');
});

test('unblockUser sends an InputPeerUser', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.unblockUser({ id: '7', accessHash: '70' }), {
    ok: true,
  });
  assert.equal(log[0].className, 'Unblock');
  assert.deepEqual(
    [log[0].id.className, log[0].id.userId, log[0].id.accessHash],
    ['InputPeerUser', 7n, 70n]
  );
  assert.equal(
    (await actions.unblockUser({ id: 'x', accessHash: '1' })).ok,
    false
  );
});

test('not connected: supported false', async () => {
  const actions = createPrivacy(
    { importer: async () => ({ Api, helpers }) },
    { userClient: async () => null }
  );
  assert.equal((await actions.privacyRules()).supported, false);
  assert.equal((await actions.sessions()).supported, false);
});

test('the page lists "find me by number" only while the phone is Nobody', () => {
  const row = (key, choice) => ({ key, choice });
  const keys = [row('lastSeen', 'everybody'), row('addedByPhone', 'contacts')];
  assert.deepEqual(
    visibleKeys([...keys, row('phoneNumber', 'contacts')]).map((k) => k.key),
    ['phoneNumber', 'lastSeen']
  );
  assert.deepEqual(
    visibleKeys([...keys, row('phoneNumber', 'nobody')]).map((k) => k.key),
    ['phoneNumber', 'addedByPhone', 'lastSeen']
  );
});

test('the routes validate and pass on', async () => {
  const seen = [];
  const note = (name) => async (r) => (seen.push([name, r]), { ok: true });
  const account = {
    privacyRules: note('rules'),
    setPrivacy: note('set'),
    sessions: note('sessions'),
    terminateSession: note('end'),
    terminateOthers: note('others'),
    blockedUsers: note('blocked'),
    unblockUser: note('unblock'),
  };
  const status = async (route, body) =>
    (await post(route, body, account)).status;
  assert.equal(await status('privacy', {}), 200);
  assert.equal(
    await status('privacy-set', { key: 'lastSeen', choice: 'contacts' }),
    200
  );
  assert.equal(
    await status('privacy-set', { key: 'toString', choice: 'nobody' }),
    400
  );
  assert.equal(
    await status('privacy-set', { key: 'lastSeen', choice: 'x' }),
    400
  );
  assert.equal(
    await status('privacy-set', { key: 'addedByPhone', choice: 'nobody' }),
    400
  );
  assert.equal(await status('privacy-set', { key: 'lastSeen' }), 400);
  assert.equal(await status('sessions', {}), 200);
  assert.equal(await status('session-terminate', { hash: '123' }), 200);
  assert.equal(await status('session-terminate', { hash: -5 }), 200);
  assert.equal(await status('session-terminate', { hash: 'abc' }), 400);
  assert.equal(await status('session-terminate', {}), 400);
  assert.equal(await status('sessions-terminate-others', {}), 200);
  assert.equal(await status('blocked', {}), 200);
  assert.equal(await status('blocked', { offset: 50, limit: 50 }), 200);
  assert.equal(await status('blocked', { limit: 0 }), 400);
  assert.equal(await status('blocked', { limit: 101 }), 400);
  assert.equal(await status('blocked', { offset: -1 }), 400);
  assert.equal(await status('blocked', { offset: '1' }), 400);
  assert.equal(await status('unblock', { id: '7', accessHash: '-70' }), 200);
  assert.equal(await status('unblock', { id: 7, accessHash: '1' }), 200);
  assert.equal(await status('unblock', { id: 'x', accessHash: '1' }), 400);
  assert.equal(await status('unblock', { id: '7' }), 400);
  assert.deepEqual(
    seen.map(([name]) => name),
    [
      'rules',
      'set',
      'sessions',
      'end',
      'end',
      'others',
      'blocked',
      'blocked',
      'unblock',
      'unblock',
    ]
  );
  assert.deepEqual(seen[1][1], { key: 'lastSeen', choice: 'contacts' });
  assert.deepEqual(seen[6][1], { offset: 0, limit: 50 });
});
