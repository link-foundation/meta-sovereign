import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { followChatsFixture } from './helpers/follow-chats.mjs';
import { createFollowDiscovery } from '../src/follow/chat-discovery.js';
import { followApi } from '../src/web/follow-api.js';
import { createAutomationCommands } from '../src/cli/automation-commands.js';
import { startServer } from '../src/server/index.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  readWireResponse,
} from '../src/transport/lino.js';
import { FollowChatsControls } from '../src/web/follow-chats-controls.js';
import { LocaleContext, translate } from '../src/web/i18n.js';

test('filtered group pages advance over raw conversations and retain latest message hints', async () => {
  const f = await followChatsFixture();
  const first = await f.discovery.chats({ limit: 2, telegramOnly: true });
  assert.deepEqual(first.chats, []);
  assert.equal(first.page.nextOffset, 2);
  assert.equal(first.page.more, true);
  const second = await f.discovery.chats({
    limit: 2,
    offset: 2,
    telegramOnly: 'true',
  });
  assert.deepEqual(
    second.chats.map((chat) => chat.chat),
    ['2000000002', '2000000003']
  );
  assert.equal(second.chats[0].memberCount, 51);
  assert.equal(
    second.chats[1].latest.text,
    'Our channel: https://t.me/Study_Group'
  );
  assert.equal(second.page.complete, true);
  assert.equal(second.page.more, false);
  assert.equal(second.page.total, 4);
  assert.equal((await f.discovery.chats()).chats.length, 3);
  assert.equal(f.state.factories, 1);
  assert.ok(
    f.calls.every(({ method }) => method === 'messages.getConversations')
  );
});

test('group details normalize local IDs, paginate members and identify recent messages', async () => {
  const f = await followChatsFixture();
  const details = await f.discovery.details({
    chat: '2',
    memberLimit: 2,
    messageLimit: 1,
  });
  assert.equal(details.chat.chat, '2000000002');
  assert.equal(details.chat.localId, '2');
  assert.equal(details.chat.canWrite, true);
  assert.deepEqual(
    details.members.map((member) => member.id),
    ['1', '2']
  );
  assert.equal(details.members[0].name, 'Member 1');
  assert.equal(details.members[0].owner, true);
  assert.equal(details.members[1].screenName, 'member2');
  assert.equal(details.memberPage.nextOffset, 2);
  assert.equal(details.messages[0].id, '13');
  assert.equal(details.messagePage.more, true);
  const last = await f.discovery.details({
    chat: '2000000002',
    memberOffset: 50,
  });
  assert.deepEqual(
    last.members.map((member) => member.id),
    ['51']
  );
  assert.equal(last.memberPage.complete, true);
  assert.equal(f.calls.length, 6);
  assert.ok(
    f.calls.every(
      ({ params }) => (params.peer_id ?? params.peer_ids) === 2000000002
    )
  );
});

test('the production VK adapter sends bounded read parameters and observes credential changes', async () => {
  const f = await followChatsFixture();
  const requests = [];
  const discovery = createFollowDiscovery({
    store: f.store,
    fetchImpl: async (url, init) => {
      requests.push({
        url: new URL(url),
        params: new URLSearchParams(init.body),
        method: init.method,
      });
      return new globalThis.Response(
        JSON.stringify({
          response: {
            count: 1,
            items: [f.conversations[2]],
          },
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    },
  });
  const result = await discovery.chats({ limit: 2, offset: 4 });
  assert.equal(result.chats[0].chat, '2000000002');
  assert.equal(requests[0].url.pathname, '/method/messages.getConversations');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].params.get('count'), '2');
  assert.equal(requests[0].params.get('offset'), '4');
  assert.equal(requests[0].params.get('access_token'), 'fixture-placeholder');
  await f.store.put({
    id: 'secret:vk:access-token',
    token: 'rotated-placeholder',
  });
  await discovery.chats();
  assert.equal(requests[1].params.get('access_token'), 'rotated-placeholder');
  await f.store.delete('secret:vk:access-token');
  await assert.rejects(discovery.chats(), { code: 'not-connected' });
  assert.equal(requests.length, 2);
});

test('invalid bounds and unsupported providers fail before provider calls; disconnected credentials are explicit', async () => {
  const f = await followChatsFixture();
  for (const input of [
    { limit: 0 },
    { limit: 201 },
    { limit: null },
    { offset: -1 },
    { offset: '' },
    { telegramOnly: 'yes' },
  ]) {
    await assert.rejects(f.discovery.chats(input), { code: 'bad-request' });
  }
  for (const input of [
    {},
    { chat: '0' },
    { chat: 2000000000 },
    { chat: 2, memberLimit: 201 },
    { chat: 2, memberOffset: -1 },
  ]) {
    await assert.rejects(f.discovery.details(input), { code: 'bad-request' });
  }
  await assert.rejects(f.discovery.chats({ source: 'telegram' }), {
    code: 'unsupported',
  });
  assert.equal(f.calls.length, 0);
  await f.store.delete('secret:vk:access-token');
  await assert.rejects(f.discovery.chats(), { code: 'not-connected' });
});

test('malformed pages and wrong peers never masquerade as successful discovery; early empty pages retain incomplete coverage', async () => {
  const f = await followChatsFixture();
  f.state.malformed = { count: 10, items: [] };
  const empty = await f.discovery.chats();
  assert.equal(empty.page.complete, false);
  assert.equal(empty.page.more, false);
  f.state.malformed = {};
  await assert.rejects(f.discovery.chats(), {
    code: 'follow-provider-response',
  });
  f.state.malformed = { items: [f.conversations[1].conversation] };
  await assert.rejects(f.discovery.details({ chat: 2 }), {
    code: 'follow-provider-response',
  });
  f.state.error = Object.assign(new Error('permission denied'), {
    vkCode: 917,
  });
  await assert.rejects(f.discovery.chats(), { vkCode: 917 });
});

test(
  'CLI and both default Lino transports expose identical discovery and redacted provider failures',
  { timeout: 15000 },
  async () => {
    const f = await followChatsFixture();
    const cli = createAutomationCommands({
      openStore: async () => f.store,
      followDiscovery: f.discovery,
    });
    const lines = [];
    await cli.automations(
      {
        _: ['follow', 'chats'],
        limit: 2,
        offset: 2,
        'telegram-only': true,
        json: true,
      },
      (line) => lines.push(line)
    );
    assert.equal(JSON.parse(lines[0]).chats.length, 2);
    await cli.automations(
      { _: ['follow', 'details'], chat: '2', 'member-limit': 2, json: true },
      (line) => lines.push(line)
    );
    assert.equal(JSON.parse(lines[1]).members.length, 2);
    const server = await startServer({
      store: f.store,
      enableSync: false,
      enableHandlers: false,
      automations: { scheduler: false },
      ...f.serverOptions,
    });
    const root = `http://127.0.0.1:${server.port}/api/automations/follow`;
    try {
      for (const type of [LINO_TEXT, LINO_BINARY]) {
        const read = (path) =>
          fetch(`${root}/${path}`, { headers: { accept: type } });
        const chats = await read('chats?limit=2&offset=2&telegramOnly=true');
        assert.equal(chats.status, 200);
        assert.equal((await readWireResponse(chats)).chats.length, 2);
        const details = await read('details?chat=2&memberLimit=2');
        assert.equal((await readWireResponse(details)).members.length, 2);
        const unsupported = await read('chats?source=telegram');
        assert.equal(unsupported.status, 404);
        assert.equal((await readWireResponse(unsupported)).code, 'unsupported');
        f.state.error = Object.assign(
          new Error('private provider diagnostic'),
          { vkCode: 917 }
        );
        const refused = await read('chats');
        const error = await readWireResponse(refused);
        assert.equal(error.code, 'follow-provider-error');
        assert.equal(error.providerCode, 917);
        assert.ok(
          !JSON.stringify(error).includes('private provider diagnostic')
        );
        f.state.error = null;
      }
    } finally {
      await server.close();
    }
  }
);

test('shared browser discovery requires a server and rejects empty or malformed responses', async () => {
  const f = await followChatsFixture();
  const noServer = followApi({
    store: f.store,
    remote: { request: async () => null },
  });
  await assert.rejects(noServer.followChats(), {
    code: 'follow-server-required',
  });
  for (const data of ['', '{}', '{"chats":[]}']) {
    const api = followApi({
      store: f.store,
      remote: { request: async () => new globalThis.Response(data) },
    });
    await assert.rejects(api.followChats(), {
      code: 'follow-provider-response',
    });
    await assert.rejects(api.followChatDetails({ chat: 2 }), {
      code: 'follow-provider-response',
    });
  }
});

test('four locales render group discovery scope and provider limitations', () => {
  for (const locale of ['en', 'ru', 'zh', 'hi']) {
    const t = (key, vars) => translate(locale, key, vars);
    const markup = renderToStaticMarkup(
      React.createElement(
        LocaleContext.Provider,
        { value: { t } },
        React.createElement(FollowChatsControls, { api: {} })
      )
    );
    for (const key of [
      'title',
      'hint',
      'scope',
      'limit',
      'telegramOnly',
      'load',
    ]) {
      assert.ok(markup.includes(t(`followChats.${key}`)), `${locale}: ${key}`);
    }
    assert.ok(!markup.includes('followChats.'));
  }
});

test('successful HTTP status with incomplete discovery pagination is rejected before rendering', async () => {
  const f = await followChatsFixture();
  for (const body of [
    { chats: [], page: { more: false } },
    {
      chat: { chat: '2000000002' },
      members: [],
      messages: [],
      memberPage: { more: false },
    },
  ]) {
    const api = followApi({
      store: f.store,
      remote: {
        request: async () => new globalThis.Response(JSON.stringify(body)),
      },
    });
    const action = body.chats ? api.followChats : api.followChatDetails;
    await assert.rejects(action({ chat: '2' }), {
      code: 'follow-provider-response',
    });
  }
});
