// R-Z11: GitHub as a full inbox. A fake GitHub on a loopback port
// (./helpers/fake-github.mjs); nothing reaches the real one.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubLive } from '../src/sources/github.js';
import { createMemoryStore } from '../src/storage/index.js';
import { createPullRunner, loadPullState } from '../src/sources/pull-runner.js';
import { createGithubService } from '../src/server/github-service.js';
import { startFakeGithub } from './helpers/fake-github.mjs';

const T0 = '2026-01-01T00:00:00Z';
const user = { login: 'ann' };
const issue = (number, updated = T0) => ({
  id: 1000 + number,
  node_id: `I_${number}`,
  number,
  title: `Issue ${number}`,
  body: 'body',
  user,
  created_at: T0,
  updated_at: updated,
  url: `https://api.github.com/repos/o/r/issues/${number}`,
  html_url: `https://github.com/o/r/issues/${number}`,
});
const comment = (id, issueNumber, updated = T0) => ({
  id,
  node_id: `IC_${id}`,
  body: `comment ${id}`,
  user,
  created_at: T0,
  updated_at: updated,
  url: `https://api.github.com/repos/o/r/issues/comments/${id}`,
  issue_url: `https://api.github.com/repos/o/r/issues/${issueNumber}`,
});
const reviewComment = (id, pull, updated = T0, extra = {}) => ({
  id,
  node_id: `RC_${id}`,
  body: `review ${id}`,
  user,
  created_at: T0,
  updated_at: updated,
  url: `https://api.github.com/repos/o/r/pulls/comments/${id}`,
  pull_request_url: `https://api.github.com/repos/o/r/pulls/${pull}`,
  pull_request_review_id: 5,
  path: 'a.js',
  line: 3,
  diff_hunk: '@@ -1 +1 @@',
  ...extra,
});
const pull = (number, updated = T0) => ({
  ...issue(number, updated),
  id: 2000 + number,
  head: { sha: 'abc' },
  url: `https://api.github.com/repos/o/r/pulls/${number}`,
});

const fixture = () => ({
  repos: {
    'o/r': {
      issues: [issue(1), issue(2)],
      comments: [comment(11, 1)],
      pulls: [pull(9)],
      reviewComments: [
        reviewComment(21, 9),
        reviewComment(22, 9, T0, { in_reply_to_id: 21 }),
      ],
      reviews: {
        9: [
          {
            id: 31,
            state: 'APPROVED',
            body: 'lgtm',
            user,
            submitted_at: T0,
          },
        ],
      },
    },
  },
});

const noSleep = { sleep: async () => {}, maxWaitMs: 5000 };
const liveOf = (fake, extra = {}) =>
  createGithubLive({
    token: 'pat',
    owner: 'o',
    repo: 'r',
    fetchImpl: globalThis.fetch,
    baseUrl: fake.baseUrl,
    ...noSleep,
    ...extra,
  });

const withFake = async (initial, work) => {
  const fake = await startFakeGithub(initial);
  try {
    return await work(fake);
  } finally {
    await fake.close();
  }
};

describe('R-Z11 external ids', () => {
  it('keeps the GitHub id, node id, owner, repo and number on every kind', async () => {
    await withFake(fixture(), async (fake) => {
      const { links } = await liveOf(fake).pullMessages();
      const by = (kind) => links.find((l) => l.externalId?.kind === kind);
      assert.deepEqual(by('issue-comment').externalId, {
        network: 'github',
        kind: 'issue-comment',
        id: 11,
        nodeId: 'IC_11',
        owner: 'o',
        repo: 'r',
        number: 1,
      });
      const rc = links.find((l) => l.externalId.id === 22);
      assert.equal(rc.externalId.kind, 'review-comment');
      assert.equal(rc.externalId.number, 9);
      assert.equal(rc.externalId.inReplyTo, 21);
      assert.equal(rc.diff.path, 'a.js');
      assert.ok(by('issue') && by('pr') && by('review'));
      assert.equal(by('issue-comment').messageId, '11');
    });
  });

  it('edits, deletes and reacts on the object the reference names', async () => {
    await withFake(fixture(), async (fake) => {
      const live = liveOf(fake);
      const { links } = await live.pullMessages();
      const issueComment = links.find((l) => l.externalId.id === 11);
      const review = links.find((l) => l.externalId.id === 22);
      await live.editMessage({ link: issueComment, text: 'new' });
      await live.editMessage({ link: review, text: 'new r' });
      await live.react({ link: review, emoji: '👍' });
      await live.deleteMessages({ links: [issueComment] });
      assert.deepEqual(
        fake.state.writes.map((w) => `${w.method} ${w.path}`),
        [
          'PATCH /repos/o/r/issues/comments/11',
          'PATCH /repos/o/r/pulls/comments/22',
          'POST /repos/o/r/pulls/comments/22/reactions',
          'DELETE /repos/o/r/issues/comments/11',
        ]
      );
    });
  });

  it('edits an issue body with its title, through the issue endpoint', async () => {
    await withFake(fixture(), async (fake) => {
      const live = liveOf(fake);
      const { links } = await live.pullMessages();
      const first = links.find((l) => l.externalId.kind === 'issue');
      await live.editMessage({ link: first, text: 'Title\n\nBody text' });
      assert.deepEqual(fake.state.writes[0].body, {
        title: 'Title',
        body: 'Body text',
      });
      assert.match(fake.state.writes[0].path, /^\/repos\/o\/r\/issues\/\d+$/);
    });
  });

  it('refuses an old item without a reference, sending nothing', async () => {
    await withFake(fixture(), async (fake) => {
      const live = liveOf(fake);
      const old = { id: 'msg:github:issue-comment:o/r#11', source: 'github' };
      for (const call of [
        () => live.editMessage({ link: old, text: 'x' }),
        () => live.deleteMessages({ links: [old] }),
        () => live.react({ link: old, emoji: '👍' }),
      ]) {
        await assert.rejects(call, (e) => {
          assert.equal(e.code, 'no-external-id');
          assert.equal(e.fallback, false);
          return true;
        });
      }
      assert.equal(fake.state.writes.length, 0);
      assert.equal(fake.state.requests.length, 0);
    });
  });

  it('replies to a review comment on the review-comment reply endpoint', async () => {
    await withFake(fixture(), async (fake) => {
      const live = liveOf(fake);
      const { links } = await live.pullMessages();
      const parent = links.find((l) => l.externalId.id === 21);
      await live.post({ text: 'thanks', replyToLink: parent });
      assert.equal(
        fake.state.writes[0].path,
        '/repos/o/r/pulls/9/comments/21/replies'
      );
      assert.deepEqual(fake.state.writes[0].body, { body: 'thanks' });
    });
  });

  it('posts from a chat key owner/repo#N (the composer)', async () => {
    await withFake(fixture(), async (fake) => {
      await liveOf(fake, { owner: null, repo: null }).post({
        text: 'hi',
        chat: 'o/r#1',
      });
      assert.equal(fake.state.writes[0].path, '/repos/o/r/issues/1/comments');
    });
  });
});

describe('R-Z11 pagination and rate limits', () => {
  it('follows Link headers past 50 pages (no page counting)', async () => {
    const userRepos = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      full_name: `o/r${i}`,
    }));
    await withFake({ userRepos }, async (fake) => {
      const repos = await liveOf(fake).listRepos({ perPage: 1 });
      assert.equal(repos.length, 60);
    });
  });

  it('does not loop on a Link that points to itself', async () => {
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new globalThis.Headers({ Link: `<${url}>; rel="next"` }),
      text: async () => '[{"id":1}]',
    });
    const live = createGithubLive({ token: 't', fetchImpl, ...noSleep });
    const repos = await live.listRepos();
    assert.equal(repos.length, 1);
  });

  it('waits out a secondary limit (retry-after) and carries on', async () => {
    await withFake(fixture(), async (fake) => {
      fake.state.refuse.push({
        status: 403,
        headers: { 'retry-after': '2' },
        message: 'secondary rate limit',
      });
      const slept = [];
      const live = liveOf(fake, { sleep: async (ms) => slept.push(ms) });
      const result = await live.pullMessages();
      assert.deepEqual(slept, [2000]);
      assert.ok(result.links.length > 0);
    });
  });

  it('reports a long wait as rate-limited with retryAfter, never crashes', async () => {
    await withFake(fixture(), async (fake) => {
      fake.state.refuse.push({
        status: 429,
        headers: { 'retry-after': '3600' },
      });
      await assert.rejects(liveOf(fake).pullMessages(), (e) => {
        assert.equal(e.code, 'rate-limited');
        assert.equal(e.retryAfter, 3600);
        return true;
      });
    });
  });

  it('stops asking while the primary budget is spent', async () => {
    await withFake({ userRepos: [] }, async (fake) => {
      const now = Date.now();
      fake.state.remaining = 0;
      fake.state.reset = Math.floor(now / 1000) + 7200;
      const live = liveOf(fake, { now: () => now });
      await live.listRepos();
      const before = fake.state.requests.length;
      await assert.rejects(live.listRepos(), (e) => e.code === 'rate-limited');
      assert.equal(fake.state.requests.length, before);
    });
  });
});

const service = (fake, store, extra = {}) =>
  createGithubService({
    store,
    ctx: {
      githubLiveFactory: (opts) =>
        liveOf(fake, { ...opts, owner: null, repo: null, ...extra }),
    },
  });
const ready = async (fake, extra = {}) => {
  const store = createMemoryStore();
  await store.put({ id: 'secret:github:access-token', token: 'pat' });
  const svc = service(fake, store, extra);
  await svc.saveSettings({ repos: ['o/r'] });
  return { store, svc };
};

describe('R-Z11 incremental pull', () => {
  it('asks only for what changed since the cursor, and 304s are free', async () => {
    await withFake(fixture(), async (fake) => {
      // A fixed clock: the ETag belongs to the url, which holds `since`.
      const NOW = Date.parse('2026-06-01T00:00:00Z');
      const { store, svc } = await ready(fake, { now: () => NOW });
      const first = await svc.fetchNow();
      assert.equal(first.repos[0].imported, 7);
      const cursor = await store.get('cursor:github:o/r');
      assert.ok(cursor.since);
      fake.state.requests.length = 0;
      const second = await svc.fetchNow();
      assert.equal(second.repos[0].imported, 0);
      assert.equal(second.repos[0].notModified, false);
      assert.ok(
        fake.state.requests.some((r) => r.search.includes('since=')),
        'the second pull passes since'
      );
      fake.state.requests.length = 0;
      const third = await svc.fetchNow();
      assert.equal(third.repos[0].notModified, true);
      assert.ok(
        fake.state.requests.every((r) => r.headers['if-none-match']),
        'every stream is conditional'
      );
    });
  });

  it('brings in a new comment and only the changed pull request reviews', async () => {
    await withFake(fixture(), async (fake) => {
      const { store, svc } = await ready(fake);
      await svc.fetchNow();
      const later = '2999-01-01T00:00:00Z';
      fake.state.repos['o/r'].comments.push(comment(12, 2, later));
      fake.state.requests.length = 0;
      const again = await svc.fetchNow();
      assert.equal(again.repos[0].imported, 1);
      assert.ok(await store.get('msg:github:issue-comment:o/r#12'));
      assert.ok(
        !fake.state.requests.some((r) => r.path.endsWith('/reviews')),
        'no review request for an unchanged pull'
      );
    });
  });

  it('does not move the cursor when the store write fails (R-Z14)', async () => {
    await withFake(fixture(), async (fake) => {
      const { store, svc } = await ready(fake);
      const put = store.put.bind(store);
      store.put = async (link) => {
        if (String(link.id).startsWith('msg:github:issue-comment')) {
          throw Object.assign(new Error('disk full'), {
            code: 'STORE_WRITE_FAILED',
          });
        }
        return put(link);
      };
      const result = await svc.fetchNow();
      assert.equal(result.repos[0].code, 'STORE_WRITE_FAILED');
      assert.equal(await store.get('cursor:github:o/r'), null);
    });
  });

  it('a failing repository does not stop the others; a rate limit does', async () => {
    const data = fixture();
    data.repos['o/two'] = data.repos['o/r'];
    await withFake(data, async (fake) => {
      const { svc } = await ready(fake);
      await svc.saveSettings({ repos: ['o/missing', 'o/r', 'o/two'] });
      const mixed = await svc.fetchNow();
      assert.equal(mixed.repos[0].code, 'not-found');
      assert.ok(mixed.repos[1].imported > 0);
      fake.state.refuse.push({
        status: 429,
        headers: { 'retry-after': '9999' },
      });
      const limited = await svc.fetchNow();
      assert.deepEqual(limited.rateLimited, { retryAfter: 9999 });
      assert.equal(limited.repos[2].skipped, 'rate-limited');
    });
  });
});

describe('R-Z11 the github job of the shared pull runner', () => {
  it('the shared runner schedules GitHub only when chosen and due', async () => {
    await withFake(fixture(), async (fake) => {
      const store = createMemoryStore();
      let clock = 1_000_000_000;
      const svc = createGithubService({
        store,
        now: () => clock,
        ctx: {
          githubLiveFactory: (o) =>
            liveOf(fake, { ...o, owner: null, repo: null }),
        },
      });
      const job = svc.pullJob();
      const timers = [];
      const runner = createPullRunner({
        store,
        jobs: { github: job },
        now: () => clock,
        minGapMs: 0,
        setTimer: (fn, ms) => {
          const timer = { fn, ms, cleared: false };
          timers.push(timer);
          return timer;
        },
        clearTimer: (timer) => {
          timer.cleared = true;
        },
      });
      assert.equal(await job.ready(), false, 'no token: nothing to poll');
      assert.equal((await runner.fetchNow('github')).code, 'not-connected');
      await store.put({ id: 'secret:github:access-token', token: 'pat' });
      assert.equal(await job.due(), false, 'off until repos are picked');
      await svc.saveSettings({ repos: ['o/r'], intervalMinutes: 10 });
      assert.equal(await job.due(), true, 'first run is due');
      const first = await runner.fetchNow('github');
      assert.ok(first.ok && first.imported > 0);
      assert.equal(await job.due(), false);
      clock += 5 * 60_000;
      assert.equal(await job.due(), false, 'not due yet');
      clock += 6 * 60_000;
      assert.equal(await job.due(), true, 'due after the interval');
      runner.start();
      assert.equal(timers.length, 1);
      runner.stop();
      assert.ok(
        timers.every((t) => t.cleared),
        'timers stopped on shutdown'
      );
    });
  });

  it('a rate limit is remembered: no new request until it passes', async () => {
    await withFake(fixture(), async (fake) => {
      const { svc, store } = await ready(fake);
      const job = svc.pullJob();
      fake.state.refuse.push({
        status: 429,
        headers: { 'retry-after': '120' },
      });
      await assert.rejects(job.run(), (error) => {
        assert.equal(error.code, 'rate-limited');
        assert.equal(error.retryAfter, 120);
        return true;
      });
      const before = fake.state.requests?.length;
      await assert.rejects(job.run(), { code: 'rate-limited' });
      assert.equal(fake.state.requests?.length, before, 'no hot loop');
      assert.ok((await loadPullState(store, 'github')).notBefore > 0);
    });
  });

  it('validates the saved settings', async () => {
    const svc = createGithubService({ store: createMemoryStore() });
    for (const bad of [
      { repos: ['no-slash'] },
      { repos: 'o/r' },
      { repos: ['o/r'], intervalMinutes: 1 },
      { repos: ['o/r'], intervalMinutes: 99999 },
    ]) {
      await assert.rejects(
        svc.saveSettings(bad),
        (e) => e.code === 'bad-request'
      );
    }
    assert.deepEqual(await svc.settings(), {
      repos: [],
      intervalMinutes: 0,
      notifications: false,
      discussions: false,
    });
  });
});

describe('R-Z11 notifications', () => {
  const note = (id, updated = T0, unread = true) => ({
    id: String(id),
    unread,
    reason: 'mention',
    updated_at: updated,
    last_read_at: null,
    subject: { title: `T${id}`, type: 'Issue', url: 'u' },
    repository: { full_name: 'o/r' },
  });

  it('fetches with since and If-Modified-Since and keeps the poll interval', async () => {
    await withFake(
      { notifications: [note(1), note(2)], pollInterval: 90 },
      async (fake) => {
        const live = liveOf(fake);
        const first = await live.fetchNotifications({});
        assert.equal(first.links.length, 2);
        assert.equal(first.pollInterval, 90);
        assert.equal(first.links[0].reason, 'mention');
        const second = await live.fetchNotifications({
          lastModified: first.lastModified,
          since: T0,
        });
        assert.equal(second.notModified, true);
        const last = fake.state.requests.at(-1);
        assert.equal(last.headers['if-modified-since'], first.lastModified);
        assert.match(last.search, /since=/);
      }
    );
  });

  it('never polls faster than X-Poll-Interval, and fetching marks nothing read', async () => {
    await withFake(
      { notifications: [note(1)], pollInterval: 120 },
      async (fake) => {
        const store = createMemoryStore();
        await store.put({ id: 'secret:github:access-token', token: 'pat' });
        let clock = 5_000_000;
        const svc = createGithubService({
          store,
          now: () => clock,
          ctx: { githubLiveFactory: (o) => liveOf(fake, o) },
        });
        await svc.saveSettings({ repos: [], notifications: true });
        const first = await svc.fetchNow();
        assert.equal(first.notifications.imported, 1);
        clock += 30_000;
        const early = await svc.fetchNow();
        assert.equal(early.notifications.skipped, 'poll-interval');
        assert.equal(
          fake.state.requests.filter((r) => r.path === '/notifications').length,
          1
        );
        assert.equal(
          fake.state.writes.length,
          0,
          'fetching marks nothing read'
        );
        assert.equal((await svc.notifications()).length, 1);
      }
    );
  });

  it('marks read only when asked, one thread or all', async () => {
    await withFake({ notifications: [note(1), note(2)] }, async (fake) => {
      const store = createMemoryStore();
      await store.put({ id: 'secret:github:access-token', token: 'pat' });
      const svc = createGithubService({
        store,
        ctx: { githubLiveFactory: (o) => liveOf(fake, o) },
      });
      await svc.saveSettings({ repos: [], notifications: true });
      await svc.fetchNow();
      await svc.markRead({ threadId: '1' });
      assert.deepEqual(
        fake.state.writes.map((w) => `${w.method} ${w.path}`),
        ['PATCH /notifications/threads/1']
      );
      assert.equal((await store.get('notification:github:1')).unread, false);
      assert.equal((await store.get('notification:github:2')).unread, true);
      await svc.markRead({ all: true });
      assert.equal(fake.state.writes.at(-1).method, 'PUT');
      await assert.rejects(
        svc.markRead({ threadId: '../x' }),
        (e) => e.code === 'bad-request'
      );
    });
  });
});

describe('R-Z11 discussions (GraphQL)', () => {
  const discussion = {
    id: 'D_1',
    databaseId: 500,
    number: 4,
    title: 'Ideas',
    body: 'first',
    createdAt: T0,
    updatedAt: T0,
    url: 'https://github.com/o/r/discussions/4',
    author: { login: 'ann' },
    comments: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          id: 'DC_1',
          databaseId: 600,
          body: 'top',
          createdAt: T0,
          updatedAt: T0,
          url: 'u',
          author: { login: 'bob' },
          replies: {
            nodes: [
              {
                id: 'DC_2',
                databaseId: 601,
                body: 'nested',
                createdAt: T0,
                updatedAt: T0,
                url: 'u',
                author: { login: 'ann' },
              },
            ],
          },
        },
      ],
    },
  };

  it('reads a discussion with its comments and replies', async () => {
    const data = { repos: { 'o/r': { discussions: [discussion] } } };
    await withFake(data, async (fake) => {
      const { links, enabled } = await liveOf(fake).fetchDiscussions({});
      assert.equal(enabled, true);
      assert.deepEqual(
        links.map((l) => l.id),
        [
          'msg:github:discussion:o/r#4',
          'msg:github:discussion-comment:o/r#600',
          'msg:github:discussion-comment:o/r#601',
        ]
      );
      assert.equal(links[2].replyTo, 'discussion-comment:o/r#600');
      assert.equal(links[2].externalId.parentNodeId, 'DC_1');
      assert.equal(links[0].externalId.nodeId, 'D_1');
    });
  });

  it('replies under the top comment, or finds the discussion by chat', async () => {
    const data = { repos: { 'o/r': { discussions: [discussion] } } };
    await withFake(data, async (fake) => {
      const live = liveOf(fake);
      const { links } = await live.fetchDiscussions({});
      await live.post({ text: 'mine', replyToLink: links[2] });
      const sent = fake.state.graphql.at(-1);
      assert.deepEqual(sent.variables, {
        discussionId: 'D_1',
        replyToId: 'DC_1',
        body: 'mine',
      });
      await live.post({ text: 'again', chat: 'o/r#discussion:4' });
      assert.equal(fake.state.graphql.at(-1).variables.discussionId, 'D_1');
    });
  });

  it('says so when the token cannot see discussions, and the pull goes on', async () => {
    const data = fixture();
    await withFake(data, async (fake) => {
      fake.state.graphqlError = {
        type: 'FORBIDDEN',
        message: 'Resource not accessible',
      };
      await assert.rejects(
        liveOf(fake).fetchDiscussions({}),
        (e) => e.code === 'discussions-unavailable'
      );
      const store = createMemoryStore();
      await store.put({ id: 'secret:github:access-token', token: 'pat' });
      const svc = createGithubService({
        store,
        ctx: {
          githubLiveFactory: (o) =>
            liveOf(fake, { ...o, owner: null, repo: null }),
        },
      });
      await svc.saveSettings({ repos: ['o/r'], discussions: true });
      const out = await svc.fetchNow();
      assert.equal(
        out.repos[0].discussionsNote.code,
        'discussions-unavailable'
      );
      assert.ok(out.repos[0].imported > 0);
    });
  });
});
