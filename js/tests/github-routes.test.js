// R-Z11: the /api/github/* routes over HTTP against the fake GitHub.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubLive } from '../src/sources/github.js';
import { createMemoryStore } from '../src/storage/index.js';
import { startServer } from '../src/server/index.js';
import { startFakeGithub } from './helpers/fake-github.mjs';

const T0 = '2026-01-01T00:00:00Z';
const repoData = {
  issues: [
    {
      id: 1,
      number: 1,
      title: 'One',
      body: 'b',
      user: { login: 'ann' },
      created_at: T0,
      updated_at: T0,
      url: 'https://api.github.com/repos/o/r/issues/1',
    },
  ],
  comments: [],
  pulls: [],
  reviewComments: [],
  reviews: {},
};

const boot = async (initial, { token = true } = {}) => {
  const fake = await startFakeGithub({
    repos: { 'o/r': repoData },
    userRepos: [
      { id: 1, full_name: 'o/r', private: true, description: 'mine' },
      { id: 2, full_name: 'o/other', private: false },
    ],
    notifications: [
      {
        id: '5',
        unread: true,
        reason: 'review_requested',
        updated_at: T0,
        subject: { title: 'Please review', type: 'PullRequest', url: 'u' },
        repository: { full_name: 'o/r' },
      },
    ],
    ...initial,
  });
  const store = createMemoryStore();
  if (token) {
    await store.put({ id: 'secret:github:access-token', token: 'pat-secret' });
  }
  const server = await startServer({
    store,
    enableSync: false,
    enableHandlers: false,
    automations: { scheduler: false },
    pulls: {
      githubLiveFactory: (options) =>
        createGithubLive({
          ...options,
          owner: null,
          repo: null,
          baseUrl: fake.baseUrl,
          sleep: async () => {},
        }),
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  const done = async () => {
    await server.close();
    await fake.close();
  };
  return { fake, store, call, done };
};

describe('R-Z11 /api/github routes', () => {
  it('lists repositories with the chosen ones marked, and saves the choice', async () => {
    const { call, done } = await boot();
    try {
      const first = await call('GET', '/api/github/repos');
      assert.equal(first.status, 200);
      assert.deepEqual(
        first.body.repos.map((r) => [r.fullName, r.selected, r.private]),
        [
          ['o/r', false, true],
          ['o/other', false, false],
        ]
      );
      const saved = await call('POST', '/api/github/settings', {
        repos: ['o/r'],
        intervalMinutes: 15,
        notifications: true,
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.body.settings.intervalMinutes, 15);
      const again = await call('GET', '/api/github/repos');
      assert.equal(again.body.repos[0].selected, true);
      const got = await call('GET', '/api/github/settings');
      assert.deepEqual(got.body.settings.repos, ['o/r']);
    } finally {
      await done();
    }
  });

  it('refuses bad settings with the uniform error and a foreign-type POST', async () => {
    const { call, done } = await boot();
    try {
      const bad = await call('POST', '/api/github/settings', { repos: ['x'] });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.ok, false);
      assert.equal(bad.body.code, 'bad-request');
      const plain = await call(
        'POST',
        '/api/github/settings',
        { repos: [] },
        { 'content-type': 'text/plain' }
      );
      assert.equal(plain.status, 403);
      assert.equal(plain.body.ok, false);
    } finally {
      await done();
    }
  });

  it('fetches the chosen repositories and the notification inbox on demand', async () => {
    const { call, done, store, fake } = await boot();
    try {
      await call('POST', '/api/github/settings', {
        repos: ['o/r'],
        notifications: true,
      });
      // Fetch now is the shared pull runner's (R-Z8), not a GitHub-only route.
      const fetched = await call('POST', '/api/pull', { source: 'github' });
      assert.equal(fetched.status, 200);
      assert.equal(fetched.body.imported, 1);
      assert.equal((await call('POST', '/api/github/fetch', {})).status, 404);
      assert.ok(await store.get('msg:github:issue:o/r#1'));
      const inbox = await call('GET', '/api/github/notifications');
      assert.equal(inbox.body.notifications[0].reason, 'review_requested');
      assert.equal(fake.state.writes.length, 0);
      const read = await call('POST', '/api/github/notifications/read', {
        threadId: '5',
      });
      assert.equal(read.status, 200);
      assert.equal(fake.state.writes[0].path, '/notifications/threads/5');
      const bad = await call('POST', '/api/github/notifications/read', {
        threadId: 'x',
      });
      assert.equal(bad.status, 400);
    } finally {
      await done();
    }
  });

  it('says what to do when no token is saved', async () => {
    const { call, done } = await boot({}, { token: false });
    try {
      const res = await call('GET', '/api/github/repos');
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'no-token');
    } finally {
      await done();
    }
  });

  it('answers 429 with retryAfter on a long rate limit, and never leaks the token', async () => {
    const { call, done, fake } = await boot();
    try {
      fake.state.refuse.push({
        status: 429,
        headers: { 'retry-after': '7200' },
      });
      const res = await call('GET', '/api/github/repos');
      assert.equal(res.status, 429);
      assert.equal(res.body.code, 'rate-limited');
      assert.equal(res.body.retryAfter, 7200);
      assert.ok(!JSON.stringify(res.body).includes('pat-secret'));
    } finally {
      await done();
    }
  });

  it('refuses edit of an item pulled before ids were kept, with a clear code', async () => {
    const { call, done, store, fake } = await boot();
    try {
      await store.put({
        id: 'msg:github:issue-comment:o/r#11',
        source: 'github',
        chat: 'o/r#1',
        sender: 'ann',
        body: 'old',
        timestamp: T0,
      });
      const res = await call('POST', '/api/message/edit', {
        ids: ['msg:github:issue-comment:o/r#11'],
        text: 'new',
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.code, 'no-external-id');
      assert.equal(fake.state.writes.length, 0);
    } finally {
      await done();
    }
  });
});
