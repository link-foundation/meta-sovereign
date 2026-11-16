import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../src/storage/universal.js';
import { withCausalWrites } from '../src/storage/causal-writes.js';
import {
  withMessageVersions,
  messageVersions,
} from '../src/storage/message-versions.js';
import { archiveBrowserHistoryWindow } from '../src/sources/browser-history-archive.js';
import { learnArchivedAnswers } from '../src/automation/question-archive.js';
import { createQuestionBrowser } from '../src/automation/question-browser.js';
import {
  unreadInput,
  unreadPass,
  unreadReviewFixture,
  waitUnreadReview,
} from '../../experiments/issue-56/question-unread-review-fixture.mjs';

const rows = () => [
  {
    id: '101',
    body: 'Do you have distributed systems experience?',
    outgoing: false,
    timestamp: '2026-11-11T10:00:00Z',
  },
  {
    id: '102',
    body: 'Yes, five years.',
    outgoing: true,
    timestamp: '2026-11-11T10:01:00Z',
  },
];
const input = (extra = {}) => ({
  source: 'hh',
  chat: '8',
  rows: rows(),
  ...extra,
});
const failure = { code: 'question-history-save-failed' };
const wrappedStore = () =>
  withMessageVersions(withCausalWrites(createMemoryStore()));

test('observed browser windows enter the existing archive and unapproved learner', async () => {
  const store = wrappedStore();
  assert.deepEqual(await archiveBrowserHistoryWindow(store, input()), {
    observed: 2,
    changed: 2,
  });
  const saved = await store.get('msg:hh:8:102');
  assert.equal(saved.sender, 'me');
  assert.equal(saved.outgoing, true);
  assert.equal(saved.via, 'browser');
  assert.equal(saved.timestamp, '2026-11-11T10:01:00.000Z');
  const learned = await learnArchivedAnswers(store);
  assert.equal(learned.rules.length, 1);
  assert.equal(learned.rules[0].answers[0].text, 'Yes, five years.');
  assert.equal(learned.rules[0].answers[0].approved, false);
});

test('overlapping native IDs avoid duplicate writes and preserve observed edits', async () => {
  const store = wrappedStore();
  await archiveBrowserHistoryWindow(store, input());
  const before = await store.get('msg:hh:8:102');
  assert.deepEqual(await archiveBrowserHistoryWindow(store, input()), {
    observed: 2,
    changed: 0,
  });
  assert.deepEqual((await store.get(before.id)).vc, before.vc);
  const edited = rows();
  edited[1].body = 'Yes, six years.';
  assert.equal(
    (await archiveBrowserHistoryWindow(store, input({ rows: edited }))).changed,
    1
  );
  const versions = await messageVersions(store, before.id);
  assert.deepEqual(
    new Set(versions.versions.map((version) => version.snapshot.body)),
    new Set(['Yes, five years.', 'Yes, six years.'])
  );
});

test('chat identities, service barriers, private links and unknown chronology stay separate', async () => {
  const store = wrappedStore();
  const window = rows();
  window[1].links = ['https://example.invalid/private/access'];
  await archiveBrowserHistoryWindow(store, input({ rows: window }));
  assert.equal((await learnArchivedAnswers(store)).rules.length, 0);
  await archiveBrowserHistoryWindow(store, input());
  assert.deepEqual((await store.get('msg:hh:8:102')).links, []);
  await archiveBrowserHistoryWindow(
    store,
    input({
      chat: '9',
      rows: [{ ...rows()[0], body: '', service: true, timestamp: null }],
    })
  );
  const service = await store.get('msg:hh:9:101');
  assert.equal(service.timestamp, null);
  assert.equal(service.service, true);
  assert.equal((await store.get('msg:hh:8:101')).body, rows()[0].body);
});

test('a corrected native service classification replaces stale archive metadata', async () => {
  const store = wrappedStore();
  await archiveBrowserHistoryWindow(
    store,
    input({ rows: [{ ...rows()[0], service: true }] })
  );
  await archiveBrowserHistoryWindow(store, input());
  assert.equal((await store.get('msg:hh:8:101')).service, false);
  assert.equal((await learnArchivedAnswers(store)).rules.length, 1);
});

test('invalid or cancelled windows refuse before storage access without private diagnostics', async () => {
  let reads = 0;
  const store = {
    get: () => {
      reads++;
      assert.fail('Invalid window reached storage');
    },
  };
  const controller = new AbortController();
  controller.abort();
  for (const invalid of [
    input({ chat: '' }),
    input({ source: '' }),
    input({ rows: [null] }),
    input({ rows: [rows()[0], rows()[0]] }),
    input({ rows: [{ ...rows()[0], id: '' }] }),
    input({ rows: [{ ...rows()[0], body: 'x'.repeat(6001) }] }),
    input({ rows: [{ ...rows()[0], outgoing: undefined }] }),
    input({ rows: [{ ...rows()[0], links: ['x'.repeat(2001)] }] }),
    input({
      rows: Array.from({ length: 501 }, (_, index) => ({
        ...rows()[0],
        id: String(index),
      })),
    }),
    input({ signal: controller.signal }),
  ]) {
    await assert.rejects(archiveBrowserHistoryWindow(store, invalid), failure);
  }
  assert.equal(reads, 0);
});

test(
  'unread service archives each window before returning its question review',
  { timeout: 5000 },
  async () => {
    const env = await unreadReviewFixture(async (options, current) => {
      assert.equal(typeof options.onHistoryWindow, 'function');
      await options.onHistoryWindow({ chat: '8', rows: rows() });
      assert.equal(
        (await current.store.get('msg:hh:8:102')).body,
        rows()[1].body
      );
      return unreadPass();
    });
    const request = unreadInput();
    try {
      await env.browser.unreadStart(request);
      const result = await waitUnreadReview(env.browser, request.id);
      assert.equal(result.state, 'completed');
      assert.deepEqual(result.archive, {
        windows: 1,
        observations: 2,
        changed: 2,
      });
      const restarted = createQuestionBrowser(env);
      try {
        assert.deepEqual(
          (await restarted.unreadStatus(request)).archive,
          result.archive
        );
        await restarted.unreadStart(request);
        assert.equal(env.state.scans.length, 1);
      } finally {
        await restarted.close();
      }
      assert.deepEqual(env.state.prefills, []);
      assert.deepEqual(env.state.sends, []);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'a rejected archive flush prevents reviews and excludes private failure text',
  { timeout: 5000 },
  async () => {
    const env = await unreadReviewFixture(async (options, current) => {
      current.store.flush = async () => {
        throw new Error('private message/path fixture');
      };
      try {
        await options.onHistoryWindow({ chat: '8', rows: rows() });
      } finally {
        delete current.store.flush;
      }
      assert.fail('A failed checkpoint must stop traversal');
    });
    const request = unreadInput();
    try {
      await env.browser.unreadStart(request);
      const result = await waitUnreadReview(env.browser, request.id);
      assert.equal(result.state, 'failed');
      assert.equal(result.code, 'question-history-save-failed');
      assert.equal(result.archive, undefined);
      assert.deepEqual(result.entries, []);
      assert.equal(
        JSON.stringify(result).includes('private message/path fixture'),
        false
      );
      assert.deepEqual(env.state.sends, []);
    } finally {
      await env.browser.close();
    }
  }
);

test(
  'Stop drains an admitted archive flush before releasing the unread owner',
  { timeout: 5000 },
  async () => {
    let release;
    let entered;
    const pending = new Promise((resolve) => {
      entered = resolve;
    });
    const env = await unreadReviewFixture(async (options, current) => {
      current.store.flush = () =>
        new Promise((resolve) => {
          release = resolve;
          entered();
        });
      try {
        await options.onHistoryWindow({ chat: '8', rows: rows() });
      } finally {
        delete current.store.flush;
      }
      return unreadPass();
    });
    const request = unreadInput();
    try {
      await env.browser.unreadStart(request);
      await pending;
      let drained = false;
      const stopped = env.browser.unreadStop(request).then((result) => {
        drained = true;
        return result;
      });
      await Promise.resolve();
      assert.equal(drained, false);
      delete env.store.flush;
      release();
      const result = await stopped;
      assert.equal(result.state, 'stopped');
      assert.deepEqual(result.entries, []);
      assert.equal(result.archive.changed, 2);
    } finally {
      delete env.store.flush;
      release?.();
      await env.browser.close();
    }
  }
);
