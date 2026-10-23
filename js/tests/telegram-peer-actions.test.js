// Block, contacts and report (R-Y128): the requests built, layer 225's
// report flow (a list, a narrower list, a comment, the end), Telegram's
// errors as codes, and the routes. Fake clients; nothing reaches a network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createPeerActions } from '../src/sources/telegram-peer-actions.js';
import { handleTelegramRoutes } from '../src/server/routes-telegram.js';

const named = (className) =>
  class {
    constructor(fields = {}) {
      Object.assign(this, fields);
      this.className = className;
    }
  };

const Api = {
  contacts: {
    Block: named('Block'),
    Unblock: named('Unblock'),
    AddContact: named('AddContact'),
    DeleteContacts: named('DeleteContacts'),
  },
  messages: { Report: named('Report'), ReportSpam: named('ReportSpam') },
  InputUser: named('InputUser'),
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
  const actions = createPeerActions(
    {
      importer: async () => ({
        Api,
        helpers: { returnBigInt: (v) => BigInt(v) },
      }),
      connection: {
        withPeer: async (_c, chat, use) =>
          use({ chat, userId: BigInt(chat), accessHash: 77n }),
      },
    },
    { userClient: async () => client }
  );
  return { actions, log };
};

const telegramError = (errorMessage) =>
  Object.assign(new Error(errorMessage), { errorMessage });

test('block and unblock send the peer', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.peerBlock({ chat: '42', block: true }), {
    ok: true,
    blocked: true,
  });
  assert.deepEqual(await actions.peerBlock({ chat: '42', block: false }), {
    ok: true,
    blocked: false,
  });
  assert.deepEqual(
    log.map((r) => r.className),
    ['Block', 'Unblock']
  );
  assert.equal(log[0].id.userId, 42n);
});

test('add contact: the typed name, the privacy exception, no phone', async () => {
  const { actions, log } = make(() => ({}));
  const answer = await actions.peerContact({
    chat: '42',
    add: true,
    firstName: ' Ann ',
    lastName: 'Lee',
    share: true,
  });
  assert.deepEqual(answer, { ok: true, contact: true });
  const [request] = log;
  assert.equal(request.className, 'AddContact');
  assert.equal(request.firstName, 'Ann');
  assert.equal(request.lastName, 'Lee');
  assert.equal(request.phone, '');
  assert.equal(request.addPhonePrivacyException, true);
  assert.equal(request.id.className, 'InputUser');
  assert.equal(request.id.accessHash, 77n);
  await actions.peerContact({ chat: '42', add: true, firstName: 'Bo' });
  assert.equal(log[1].addPhonePrivacyException, undefined);
});

test('delete contact sends the user in a vector', async () => {
  const { actions, log } = make(() => ({}));
  assert.deepEqual(await actions.peerContact({ chat: '42', add: false }), {
    ok: true,
    contact: false,
  });
  assert.equal(log[0].className, 'DeleteContacts');
  assert.equal(log[0].id.length, 1);
  assert.equal(log[0].id[0].userId, 42n);
});

test('report walks the options: list, narrower list, comment, done', async () => {
  const spam = Buffer.from([1, 2]);
  const answers = [
    {
      className: 'ReportResultChooseOption',
      title: 'Report',
      options: [{ text: 'Spam', option: spam }],
    },
    {
      className: 'ReportResultAddComment',
      optional: true,
      option: spam,
    },
    { className: 'ReportResultReported' },
  ];
  const { actions, log } = make(() => answers.shift());
  const first = await actions.peerReport({ chat: '-1005' });
  assert.deepEqual(first, {
    ok: true,
    result: 'choose',
    title: 'Report',
    options: [{ text: 'Spam', option: 'AQI=' }],
  });
  assert.equal(log[0].option.length, 0);
  assert.deepEqual(log[0].id, []);
  const second = await actions.peerReport({ chat: '-1005', option: 'AQI=' });
  assert.deepEqual(second, {
    ok: true,
    result: 'comment',
    optional: true,
    option: 'AQI=',
  });
  assert.deepEqual([...log[1].option], [1, 2]);
  const third = await actions.peerReport({
    chat: '-1005',
    option: 'AQI=',
    message: 'bad',
  });
  assert.deepEqual(third, { ok: true, result: 'reported' });
  assert.equal(log[2].message, 'bad');
});

test('report spam sends the peer', async () => {
  const { actions, log } = make(() => true);
  assert.deepEqual(await actions.peerReportSpam({ chat: '42' }), { ok: true });
  assert.equal(log[0].className, 'ReportSpam');
});

test("Telegram's errors become codes", async () => {
  const { actions } = make(() => telegramError('CONTACT_NAME_EMPTY'));
  const answer = await actions.peerContact({
    chat: '42',
    add: true,
    firstName: 'A',
  });
  assert.deepEqual(answer, {
    ok: false,
    error: 'CONTACT_NAME_EMPTY',
    code: 'name-empty',
  });
  const other = make(() => telegramError('BOOM'));
  assert.equal(
    (await other.actions.peerBlock({ chat: '4', block: true })).code,
    'failed'
  );
});

test('bad requests never reach Telegram', async () => {
  const { actions, log } = make(() => true);
  for (const bad of [
    () => actions.peerBlock({ chat: '-5', block: true }),
    () => actions.peerBlock({ chat: '5', block: 'yes' }),
    () => actions.peerContact({ chat: '5', add: true, firstName: '  ' }),
    () => actions.peerContact({ chat: '-5', add: false }),
    () => actions.peerReport({ chat: '5', option: '!!' }),
    () => actions.peerReport({ chat: '5', message: 'x'.repeat(513) }),
    () => actions.peerReportSpam({ chat: 'x' }),
  ]) {
    assert.equal((await bad()).ok, false);
  }
  assert.equal(log.length, 0);
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
  const { actions } = make(() => true);
  for (const [route, bad, good] of [
    ['peer-block', { chat: '5' }, { chat: '5', block: true }],
    ['peer-block', { chat: '-5', block: true }, { chat: '5', block: false }],
    [
      'peer-contact',
      { chat: '5', add: true },
      { chat: '5', add: true, firstName: 'A' },
    ],
    [
      'peer-contact',
      { chat: '5', add: true, firstName: 'A', lastName: 3 },
      { chat: '5', add: false },
    ],
    ['peer-report', { chat: 'x' }, { chat: '-1005' }],
    [
      'peer-report',
      { chat: '5', option: 'a b' },
      { chat: '5', option: 'AQI=' },
    ],
    ['peer-report-spam', {}, { chat: '5' }],
  ]) {
    assert.equal((await post(route, bad, actions)).status, 400, route);
    assert.equal((await post(route, good, actions)).status, 200, route);
  }
});
