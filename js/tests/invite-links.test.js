// A group's invite links and join requests (R-Y152): the links read and
// shaped, created, edited, revoked and deleted, who joined, requests
// approved or dismissed, the routes' validation and Telegram's errors.
// Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInviteLinks } from '../src/sources/telegram-invite-links.js';
import { postRoute as post } from './helpers/post-route.js';
import { bodyOf, expireOf, usageText } from '../src/web/chat-invite-links.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: Object.fromEntries(
    [
      'GetExportedChatInvites',
      'ExportChatInvite',
      'EditExportedChatInvite',
      'DeleteExportedChatInvite',
      'DeleteRevokedExportedChatInvites',
      'GetChatInviteImporters',
      'HideChatJoinRequest',
      'HideAllChatJoinRequests',
    ].map((n) => [n, named(n)])
  ),
  InputUserSelf: named('InputUserSelf'),
  InputUserEmpty: named('InputUserEmpty'),
  InputUser: named('InputUser'),
};

const LINK = 'https://t.me/+AbCdEfGhIjKl';
const OTHER = 'https://t.me/+ZyXwVuTsRqPo';

const make = ({ answer, fail = null } = {}) => {
  const log = [];
  const invoke = async (request) => {
    log.push(request);
    if (fail) {
      throw Object.assign(new Error(fail), { errorMessage: fail });
    }
    return typeof answer === 'function' ? answer(request) : answer;
  };
  const env = {
    importer: async () => ({ Api, helpers: { returnBigInt: BigInt } }),
    connection: { withPeer: async (_c, chat, use) => use({ chat }) },
  };
  const userClient = async () => ({
    invoke,
    getInputEntity: async (id) => ({ userId: id, accessHash: 7n }),
  });
  return { ...createInviteLinks(env, { userClient }), log };
};

const exported = (fields) => ({
  className: 'ChatInviteExported',
  adminId: 1n,
  date: 1000,
  ...fields,
});

test('inviteLinks: the primary apart, the others shaped, dates in ms', async () => {
  const { inviteLinks, log } = make({
    answer: {
      count: 2,
      invites: [
        exported({ link: LINK, permanent: true }),
        exported({
          link: OTHER,
          title: 'Friends',
          usage: 3,
          usageLimit: 10,
          expireDate: 2000,
          requestNeeded: true,
        }),
      ],
    },
  });
  const got = await inviteLinks({ chat: '-1005' });
  assert.equal(got.ok, true);
  assert.equal(got.primary, LINK);
  assert.equal(got.links.length, 1);
  assert.deepEqual(
    [got.links[0].title, got.links[0].usage, got.links[0].usageLimit],
    ['Friends', 3, 10]
  );
  assert.equal(got.links[0].expireDate, 2_000_000);
  assert.equal(got.links[0].requestNeeded, true);
  assert.equal(got.next, null);
  assert.equal(log[0].adminId.className, 'InputUserSelf');
  assert.equal(log[0].revoked, undefined);
});

test('inviteLinks: the revoked ones, paged by the last link', async () => {
  const invites = Array.from({ length: 50 }, (_, i) =>
    exported({
      link: `https://t.me/+Revoked${String(i).padStart(4, '0')}`,
      revoked: true,
      date: 5000 - i,
    })
  );
  const { inviteLinks, log } = make({ answer: { count: 80, invites } });
  const got = await inviteLinks({ chat: '-1005', revoked: true });
  assert.equal(log[0].revoked, true);
  assert.equal(got.primary, null);
  assert.equal(got.links.length, 50);
  assert.deepEqual(got.next, {
    offsetDate: (5000 - 49) * 1000,
    offsetLink: 'https://t.me/+Revoked0049',
  });
  await inviteLinks({ chat: '-1005', ...got.next });
  assert.equal(log[1].offsetLink, 'https://t.me/+Revoked0049');
  assert.equal(log[1].offsetDate, 5000 - 49);
});

test('inviteCreate: sends only what was set', async () => {
  const { inviteCreate, log } = make({
    answer: exported({ link: OTHER, title: 'Friends' }),
  });
  const got = await inviteCreate({
    chat: '-1005',
    title: 'Friends',
    expireDate: Math.floor(Date.now() / 1000) + 3600,
    usageLimit: 10,
  });
  assert.equal(got.ok, true);
  assert.equal(got.invite.link, OTHER);
  assert.equal(log[0].title, 'Friends');
  assert.equal(log[0].usageLimit, 10);
  assert.equal(log[0].requestNeeded, undefined);
  await inviteCreate({ chat: '-1005', requestNeeded: true });
  assert.equal(log[1].requestNeeded, true);
  assert.equal('expireDate' in log[1], false);
  assert.equal(
    (await inviteCreate({ chat: '-1005', requestNeeded: true, usageLimit: 5 }))
      .code,
    'bad-request',
    'approval and a limit exclude each other'
  );
});

test('inviteEdit: revokes, or changes with explicit zeros', async () => {
  const { inviteEdit, log } = make({
    answer: {
      className: 'messages.ExportedChatInvite',
      invite: exported({ link: OTHER, revoked: true }),
    },
  });
  const revoked = await inviteEdit({
    chat: '-1005',
    link: OTHER,
    revoked: true,
  });
  assert.equal(revoked.invite.revoked, true);
  assert.equal(log[0].revoked, true);
  await inviteEdit({
    chat: '-1005',
    link: OTHER,
    title: '',
    expireDate: 0,
    usageLimit: 0,
    requestNeeded: false,
  });
  assert.equal(log[1].expireDate, 0);
  assert.equal(log[1].usageLimit, 0);
  assert.equal(log[1].requestNeeded, false);
  assert.equal(log[1].revoked, undefined);
});

test('inviteEdit: a replaced primary link carries its replacement', async () => {
  const { inviteEdit } = make({
    answer: {
      invite: exported({ link: LINK, revoked: true }),
      newInvite: exported({ link: OTHER, permanent: true }),
    },
  });
  const got = await inviteEdit({ chat: '-1005', link: LINK, revoked: true });
  assert.equal(got.replacement.link, OTHER);
});

test('inviteDelete and inviteDeleteRevoked', async () => {
  const { inviteDelete, inviteDeleteRevoked, log } = make({ answer: true });
  assert.deepEqual(await inviteDelete({ chat: '-1005', link: LINK }), {
    ok: true,
  });
  assert.equal(log[0].className, 'DeleteExportedChatInvite');
  assert.equal(log[0].link, LINK);
  assert.deepEqual(await inviteDeleteRevoked({ chat: '-1005' }), { ok: true });
  assert.equal(log[1].adminId.className, 'InputUserSelf');
});

test('inviteImporters: who joined, and the requests with their words', async () => {
  const { inviteImporters, log } = make({
    answer: {
      count: 2,
      importers: [
        { userId: 5n, date: 3000, about: 'Let me in', requested: true },
        { userId: 6n, date: 2000 },
      ],
      users: [
        { id: 5n, accessHash: 55n, firstName: 'Ann', lastName: 'Lee' },
        { id: 6n, username: 'bob' },
      ],
    },
  });
  const got = await inviteImporters({ chat: '-1005', requested: true });
  assert.equal(log[0].requested, true);
  assert.equal(log[0].offsetUser.className, 'InputUserEmpty');
  assert.equal(got.importers[0].name, 'Ann Lee');
  assert.equal(got.importers[0].about, 'Let me in');
  assert.equal(got.importers[0].accessHash, '55');
  assert.equal(got.importers[0].date, 3_000_000);
  assert.equal(got.importers[1].name, 'bob');
  await inviteImporters({ chat: '-1005', link: LINK });
  assert.equal(log[1].link, LINK);
  assert.equal(log[1].requested, undefined);
  assert.equal(
    (await inviteImporters({ chat: '-1005' })).code,
    'bad-request',
    'a link or requests'
  );
});

test('join requests: one decided, all decided', async () => {
  const { joinRequestHide, joinRequestsHideAll, log } = make({ answer: {} });
  await joinRequestHide({
    chat: '-1005',
    user: '5',
    accessHash: '55',
    approved: true,
  });
  assert.equal(log[0].approved, true);
  assert.equal(log[0].userId.className, 'InputUser');
  assert.equal(log[0].userId.accessHash, 55n);
  await joinRequestHide({ chat: '-1005', user: '5', approved: false });
  assert.equal(log[1].approved, undefined, 'dismissed: no flag');
  assert.equal(log[1].userId.userId, 5n, 'resolved by the client');
  await joinRequestsHideAll({ chat: '-1005', approved: false });
  assert.equal(log[2].className, 'HideAllChatJoinRequests');
  assert.equal(log[2].approved, undefined);
  await joinRequestsHideAll({ chat: '-1005', approved: true, link: LINK });
  assert.equal(log[3].approved, true);
  assert.equal(log[3].link, LINK);
});

test('Telegram errors become codes', async () => {
  const cases = {
    CHAT_ADMIN_REQUIRED: 'not-admin',
    INVITE_HASH_EXPIRED: 'link-gone',
    INVITE_EXPIRE_DATE_INVALID: 'expire-invalid',
    HIDE_REQUESTER_MISSING: 'request-gone',
    ADMIN_INVITES_TOO_MUCH: 'too-many',
    SOMETHING_ELSE: 'failed',
  };
  for (const [name, code] of Object.entries(cases)) {
    const { inviteDelete } = make({ fail: name });
    const got = await inviteDelete({ chat: '-1005', link: LINK });
    assert.equal(got.ok, false);
    assert.equal(got.code, code, name);
  }
});

test('actions refuse bad input without asking Telegram', async () => {
  const { inviteCreate, inviteDelete, inviteLinks, joinRequestHide, log } =
    make({ answer: {} });
  const soon = Math.floor(Date.now() / 1000) + 60;
  for (const bad of [
    { chat: '5' },
    { chat: '-1005', title: 'x'.repeat(33) },
    { chat: '-1005', expireDate: 12 },
    { chat: '-1005', expireDate: soon + 20 * 365 * 86400 },
    { chat: '-1005', usageLimit: -1 },
    { chat: '-1005', usageLimit: 1.5 },
    { chat: '-1005', usageLimit: 1e9 },
    { chat: '-1005', requestNeeded: 'yes' },
  ]) {
    assert.equal(
      (await inviteCreate(bad)).code,
      'bad-request',
      JSON.stringify(bad)
    );
  }
  assert.equal(
    (await inviteDelete({ chat: '-1005', link: 'http://evil.example/+abc' }))
      .ok,
    false
  );
  assert.equal(
    (await inviteLinks({ chat: '-1005', offsetLink: 'nope' })).ok,
    false
  );
  assert.equal(
    (await joinRequestHide({ chat: '-1005', user: 'x', approved: true })).ok,
    false
  );
  assert.equal(log.length, 0);
});

test('routes: strict bodies, the account asked only for good ones', async () => {
  const calls = [];
  const account = new Proxy(
    {},
    {
      get: (_t, method) => async (args) => {
        calls.push([method, args]);
        return { ok: true };
      },
    }
  );
  const soon = Math.floor(Date.now() / 1000) + 3600;
  const good = {
    'invite-links': { chat: '-1005', revoked: true },
    'invite-create': {
      chat: '-1005',
      title: 'A',
      expireDate: soon,
      usageLimit: 10,
    },
    'invite-edit': { chat: '-1005', link: LINK, revoked: true },
    'invite-delete': { chat: '-1005', link: LINK },
    'invite-delete-revoked': { chat: '-1005' },
    'invite-importers': { chat: '-1005', link: LINK },
    'join-request-hide': { chat: '-1005', user: '5', approved: true },
    'join-requests-hide-all': { chat: '-1005', approved: false },
  };
  for (const [route, body] of Object.entries(good)) {
    assert.equal(await post(route, body, account), 200, route);
  }
  assert.equal(calls.length, Object.keys(good).length);
  const bad = [
    ['invite-links', { chat: 'x' }],
    ['invite-create', { chat: '-1005', expireDate: 5 }],
    ['invite-create', { chat: '-1005', usageLimit: 'ten' }],
    ['invite-create', { chat: '-1005', requestNeeded: true, usageLimit: 1 }],
    ['invite-edit', { chat: '-1005', link: 'https://t.me/abc' }],
    ['invite-edit', { chat: '-1005', link: LINK, revoked: false }],
    ['invite-delete', { chat: '-1005' }],
    ['invite-importers', { chat: '-1005' }],
    [
      'invite-importers',
      { chat: '-1005', requested: true, offset: { date: 'x' } },
    ],
    ['join-request-hide', { chat: '-1005', user: '5' }],
    ['join-request-hide', { chat: '-1005', user: '5', approved: 'yes' }],
    ['join-requests-hide-all', { chat: '-1005' }],
    ['join-requests-hide-all', { chat: '-1005', approved: true, link: 'x' }],
  ];
  for (const [route, body] of bad) {
    assert.equal(
      await post(route, body, account),
      400,
      `${route} ${JSON.stringify(body)}`
    );
  }
  assert.equal(calls.length, Object.keys(good).length, 'nothing more asked');
});

test('page helpers: the form becomes a body, usage in words', () => {
  const now = 1_700_000_000_000;
  assert.equal(expireOf('0', now), 0);
  assert.equal(expireOf('keep', now), undefined);
  assert.equal(expireOf('3600', now), 1_700_003_600);
  const form = {
    title: ' Friends ',
    expiry: '86400',
    limit: '10',
    approval: false,
  };
  assert.deepEqual(bodyOf('-1005', null, form, now), {
    chat: '-1005',
    title: 'Friends',
    expireDate: 1_700_086_400,
    usageLimit: 10,
  });
  assert.deepEqual(
    bodyOf(
      '-1005',
      null,
      { title: '', expiry: '0', limit: '0', approval: true },
      now
    ),
    { chat: '-1005', requestNeeded: true }
  );
  assert.deepEqual(
    bodyOf(
      '-1005',
      { link: LINK },
      { ...form, expiry: 'keep', approval: true },
      now
    ),
    {
      chat: '-1005',
      link: LINK,
      title: 'Friends',
      usageLimit: 0,
      requestNeeded: true,
    }
  );
  const t = (key, vars) => `${key}:${JSON.stringify(vars ?? {})}`;
  assert.match(
    usageText(t, { usage: 2, usageLimit: 10 }),
    /usedOf.*"used":2.*"limit":10/
  );
  assert.match(usageText(t, { usage: 3, usageLimit: 0 }), /joined.*"count":3/);
  assert.match(usageText(t, { usage: 0, usageLimit: 0 }), /noJoins/);
});
