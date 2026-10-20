// GET /api/people/learned and the GitHub check behind it (R-Y50 ..
// R-Y53). A fake GitHub and a memory store: nothing here reaches a
// network or a running app.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMemoryStore } from '../src/storage/universal.js';
import { createChatIndex } from '../src/server/chat-index.js';
import { createLearnedRoute } from '../src/server/routes-learned.js';
import {
  createGitHubCheck,
  githubCheckId,
  githubVerdict,
} from '../src/sources/github-check.js';
import { historyLinkId } from '../src/sources/telegram-history.js';

const response = (status, body, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => body,
});

const fakeGitHub = (profiles) => {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    const [, login, more] =
      url.match(/\/users\/([^/]+)(\/social_accounts)?$/u) ?? [];
    const profile = profiles[login];
    if (!profile) {
      return response(404, { message: 'Not Found' });
    }
    return response(200, more ? (profile.socials ?? []) : profile.user);
  };
  return { fetch, asked };
};

const PROFILES = {
  janedoe: {
    user: {
      login: 'janedoe',
      name: 'Jane Doe',
      bio: 'Builder',
      public_repos: 3,
    },
    socials: [{ provider: 'generic', url: 'https://t.me/jane_d' }],
  },
  johnroe: { user: { login: 'johnroe', name: 'John Roe' } },
  someone: { user: { login: 'someone', name: 'Other Person' } },
};

test('a profile linking back to their Telegram confirms the account', () => {
  const record = { status: 'found', ...PROFILES.janedoe };
  assert.equal(
    githubVerdict(record, { username: 'jane_d' }).status,
    'confirmed'
  );
  assert.equal(githubVerdict(record, { username: '@Jane_D' }).via, 'telegram');
  assert.equal(githubVerdict(record, { username: 'jane' }).status, 'shared');
  assert.equal(
    githubVerdict(
      { status: 'found', ...PROFILES.johnroe },
      { name: 'john  roe' }
    ).status,
    'name'
  );
  assert.equal(githubVerdict({ status: 'missing' }).status, 'missing');
  assert.equal(githubVerdict(null).status, 'unknown');
});

test('GitHub is asked once a week per login, and a rate limit is waited out', async () => {
  const store = createMemoryStore();
  const github = fakeGitHub(PROFILES);
  let now = Date.UTC(2026, 9, 1);
  const check = createGitHubCheck({
    store,
    fetch: github.fetch,
    now: () => now,
  });
  const [a, b] = await Promise.all([
    check.check('janedoe', { username: 'jane_d' }),
    check.check('janedoe', { username: 'jane_d' }),
  ]);
  assert.equal(a.status, 'confirmed');
  assert.equal(b.status, 'confirmed');
  assert.equal(github.asked.length, 2, 'the profile and its links, once');
  assert.equal((await store.get(githubCheckId('janedoe'))).status, 'found');
  await check.check('janedoe');
  assert.equal(github.asked.length, 2);
  assert.equal((await check.check('nobody-here')).status, 'missing');
  assert.equal((await check.check('bad/login')).status, 'unknown');

  now += 8 * 24 * 3_600_000;
  const limited = createGitHubCheck({
    store,
    fetch: async () => response(403, {}, { 'x-ratelimit-reset': '0' }),
    now: () => now,
  });
  // A stale answer is still better than none while GitHub says wait.
  assert.equal(
    (await limited.check('janedoe', { username: 'jane_d' })).status,
    'confirmed'
  );
  assert.equal((await limited.check('johnroe')).status, 'unknown');
});

const message = (chat, n, sender, body) => ({
  id: `msg:telegram:${chat}:${n}`,
  tokens: [],
  source: 'telegram',
  chat,
  chatType: 'personal_chat',
  sender,
  senderName: sender === 'me' ? null : 'Jane',
  body,
  timestamp: new Date(Date.UTC(2026, 0, 1, n)).toISOString(),
});

const serve = async (route, store, ctx, key) => {
  let status = null;
  let body = '';
  const res = {
    writeHead: (s) => {
      status = s;
    },
    setHeader: () => {},
    end: (text) => {
      body = text ?? '';
    },
  };
  const url = new URL(`http://local/api/people/learned?key=${key}`);
  const handled = await route(
    store,
    { method: 'GET', url: url.href },
    res,
    url.pathname,
    url,
    ctx
  );
  return {
    handled,
    status: status ?? res.statusCode,
    body: body ? JSON.parse(body) : null,
  };
};

test('the route learns from the stored chat and asks for the rest of it first', async () => {
  const store = createMemoryStore();
  const chat = '42';
  for (const [n, sender, body] of [
    [1, 'me', 'Привет! Можно на ты?'],
    [2, chat, 'Давай'],
    [3, 'me', 'Где ты работаешь?'],
    [4, chat, 'Я работаю в Example Labs'],
    [5, chat, 'Вот мой github.com/janedoe'],
  ]) {
    await store.put(message(chat, n, sender, body));
  }
  const readFirst = [];
  const logged = [];
  const ctx = {
    chatIndex: createChatIndex(store),
    telegramAccount: {
      readFirst: (c) => readFirst.push(c),
      chatInfo: async () => ({ title: 'Jane', username: 'jane_d' }),
    },
    githubCheck: createGitHubCheck({
      store,
      fetch: fakeGitHub(PROFILES).fetch,
    }),
    log: (entry) => logged.push(entry),
  };
  const route = createLearnedRoute();
  const { handled, body } = await serve(route, store, ctx, `telegram:${chat}`);
  assert.equal(handled, true);
  assert.equal(body.personal, true);
  assert.equal(body.complete, false);
  assert.deepEqual(readFirst, [chat]);
  assert.equal(body.address.form, 'informal');
  assert.equal(body.address.basis, 'agreed');
  assert.equal(body.work[0].value, 'Example Labs');
  assert.equal(body.accounts[0].github.status, 'confirmed');
  assert.equal(body.asked.length, 2);

  // Only numbers reach the log, never what was said.
  const entry = logged.find((e) => e.event === 'people_learned');
  assert.equal(entry.questions, 2);
  assert.equal(JSON.stringify(entry).includes('Example'), false);

  await store.put({
    id: historyLinkId(chat),
    tokens: [],
    chat,
    complete: true,
  });
  const again = await serve(route, store, ctx, `telegram:${chat}`);
  assert.equal(again.body.complete, true);
  assert.equal(readFirst.length, 1);
  assert.equal(
    logged.filter((e) => e.event === 'people_learned').length,
    1,
    'kept'
  );

  const missing = await serve(route, store, ctx, '');
  assert.equal(missing.body.error, 'key is required');
});
