// Chat invite links (R-Y123): a link checked, joined only on request, a
// chat's primary link replaced, Telegram's errors as codes, the info
// reader's invite fields, the link parser and the routes. Fake clients;
// nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createInvites } from '../src/sources/telegram-invite.js';
import { canInviteIn } from '../src/sources/telegram-chat-info.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';
import { inviteHashOf } from '../src/web/chat-invite.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  messages: {
    CheckChatInvite: named('CheckChatInvite'),
    ImportChatInvite: named('ImportChatInvite'),
    ExportChatInvite: named('ExportChatInvite'),
  },
};

const make = (answer) => {
  const log = [];
  const applied = [];
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
  const invites = createInvites(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: { withPeer: async (_c, chat, use) => use({ chat }) },
    },
    {
      userClient: async () => client,
      apply: async (_c, result) => applied.push(result),
    }
  );
  return { invites, log, applied };
};

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

test('a link checked: what it leads to, or the chat the user is in', async () => {
  const { invites, log } = make((r) =>
    r.hash === 'InChat12345'
      ? {
          className: 'ChatInviteAlready',
          chat: { className: 'Channel', id: 7n },
        }
      : {
          className: 'ChatInvite',
          title: 'Club',
          participantsCount: 5,
          megagroup: true,
          requestNeeded: true,
        }
  );
  const fresh = await invites.checkChatInvite({ hash: 'FreshHash123' });
  assert.deepEqual(fresh.invite, {
    title: 'Club',
    about: '',
    members: 5,
    channel: false,
    broadcast: false,
    megagroup: true,
    requestNeeded: true,
  });
  assert.equal(fresh.already, false);
  const own = await invites.checkChatInvite({ hash: 'InChat12345' });
  assert.deepEqual([own.already, own.chat], [true, '-1007']);
  assert.equal(log.length, 2);
  assert.equal(
    (await invites.checkChatInvite({ hash: 'no way!' })).code,
    'invite-invalid'
  );
  assert.equal(log.length, 2, 'a bad hash asks nothing');
});

test('joined only when asked; the result goes through the live handler', async () => {
  const result = {
    className: 'Updates',
    chats: [{ className: 'Chat', id: 9n }],
  };
  const { invites, log, applied } = make(() => result);
  await invites.checkChatInvite({ hash: 'FreshHash123' });
  assert.equal(log.filter((r) => r.className === 'ImportChatInvite').length, 0);
  const joined = await invites.joinChatInvite({ hash: 'FreshHash123' });
  assert.deepEqual(joined, { ok: true, chat: '-9' });
  assert.equal(log.at(-1).className, 'ImportChatInvite');
  assert.deepEqual(applied, [result]);
});

test('Telegram errors become codes', async () => {
  const cases = {
    INVITE_HASH_EXPIRED: 'invite-expired',
    INVITE_REQUEST_SENT: 'invite-request-sent',
    USERS_TOO_MUCH: 'chat-full',
    CHANNELS_TOO_MUCH: 'too-many-chats',
    SOMETHING_ELSE: 'failed',
  };
  for (const [name, code] of Object.entries(cases)) {
    const { invites } = make(() => telegramError(name));
    const answer = await invites.joinChatInvite({ hash: 'FreshHash123' });
    assert.deepEqual([answer.ok, answer.code], [false, code], name);
  }
});

test('the primary link replaced with legacyRevokePermanent', async () => {
  const { invites, log } = make(() => ({
    className: 'messages.ExportedChatInviteReplaced',
    invite: { link: 'https://t.me/+old' },
    newInvite: { link: 'https://t.me/+new' },
  }));
  const answer = await invites.revokeChatInvite({ chat: '-1005' });
  assert.deepEqual(answer, { ok: true, link: 'https://t.me/+new' });
  assert.equal(log[0].legacyRevokePermanent, true);
  assert.equal(log[0].peer.chat, '-1005');
  assert.equal((await invites.revokeChatInvite({ chat: '555' })).ok, false);
});

test('who may see the link, and the link forms parsed', () => {
  assert.equal(canInviteIn({ creator: true }), true);
  assert.equal(canInviteIn({ adminRights: { inviteUsers: true } }), true);
  assert.equal(canInviteIn({ adminRights: { pinMessages: true } }), false);
  assert.equal(canInviteIn({}), false);
  assert.equal(inviteHashOf('https://t.me/+AbCdEfGh12'), 'AbCdEfGh12');
  assert.equal(inviteHashOf('https://t.me/joinchat/AbCdEfGh12'), 'AbCdEfGh12');
  assert.equal(inviteHashOf('tg://join?invite=AbCdEfGh12'), 'AbCdEfGh12');
  assert.equal(inviteHashOf('https://t.me/durov'), null);
  assert.equal(inviteHashOf('https://example.com/+AbCdEfGh12'), null);
});

const post = async (route, body, account) => {
  const path = `/api/telegram/${route}`;
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = 'POST';
  req.url = path;
  req.headers = {
    'content-type': 'application/json',
    host: '127.0.0.1:8787',
  };
  const res = {
    setHeader() {},
    writeHead(status) {
      this.status = status;
    },
    end() {},
  };
  await handleTelegramRoutes(req, res, path, {
    telegramAccount: account,
    allowOrigins: [],
  });
  return { status: res.status };
};

test('routes validate strictly', async () => {
  const account = {
    checkChatInvite: async ({ hash }) => ({ ok: true, hash }),
    joinChatInvite: async ({ hash }) => ({ ok: true, hash }),
    revokeChatInvite: async ({ chat }) => ({ ok: true, chat }),
  };
  for (const [route, bad, good] of [
    ['invite-check', { hash: 'x/y' }, { hash: 'FreshHash123' }],
    ['invite-join', {}, { hash: 'FreshHash123' }],
    ['invite-revoke', { chat: '555' }, { chat: '-1005' }],
  ]) {
    assert.equal((await post(route, bad, account)).status, 400, route);
    assert.equal((await post(route, good, account)).status, 200, route);
  }
});
