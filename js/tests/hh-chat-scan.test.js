import test from 'node:test';
import assert from 'node:assert/strict';
import { scanBrowserChatList } from '../src/sources/browser-chat-scan.js';
import { browserChatListState } from '../src/sources/browser-chat-list-state.js';
import { HH_WEB_UI } from '../src/sources/hh-web-ui.js';

const row = (chat, unread = 1) => ({ chat: String(chat), unread });
const fixture = ({
  pages = [[row(1)], [row(1, 0), row(2)]],
  loading = false,
  hook,
} = {}) => {
  let tick = 0;
  let index = 0;
  let moved = 0;
  let reads = 0;
  let status = 'ready';
  const releases = [];
  const document = {
    async evaluate({ fn, args }) {
      const [options] = args;
      if (fn !== browserChatListState) {
        reads++;
        hook?.({
          read: reads,
          change: (value) => {
            status = value;
          },
        });
        if (status === 'navigate') {
          throw Object.assign(new Error('changed'), {
            code: 'answer-chat-unverified',
          });
        }
        return pages[index];
      }
      if (options.operation === 'release') {
        releases.push(options.restore);
        return { restored: options.restore };
      }
      if (status === 'navigate') {
        throw Object.assign(new Error('changed'), {
          code: 'answer-chat-unverified',
        });
      }
      if (options.operation === 'move') {
        index = Math.min(index + 1, pages.length - 1);
        moved++;
      }
      return {
        state: status,
        top: index * 100,
        height: pages.length * 100,
        view: 100,
        bottom: index === pages.length - 1,
        loading,
      };
    },
  };
  return {
    document,
    dependencies: {
      now: () => tick,
      pause: async (ms) => {
        tick += ms;
      },
    },
    releases,
    moved: () => moved,
    reads: () => reads,
  };
};
const run = (value, options = {}, dependencies = {}) =>
  scanBrowserChatList(
    value.document,
    HH_WEB_UI,
    { waitMs: 10, endWaitMs: 100, ...options },
    { ...value.dependencies, ...dependencies }
  );

test('finite HH traversal deduplicates overlapping virtual windows and reports observed end separately', async () => {
  const value = fixture();
  const result = await run(value);
  assert.deepEqual(result.rows, [row(1, 0), row(2)]);
  assert.equal(result.coverage.reason, 'rendered-end');
  assert.equal(result.coverage.endObserved, true);
  assert.equal(result.coverage.complete, false);
  assert.equal(result.restored, true);
  assert.deepEqual(value.releases, [true]);
});

test('row, pass, loading and time bounds retain only observed coverage', async () => {
  for (const [options, reason] of [
    [{ limit: 1 }, 'row-limit'],
    [{ maxPasses: 1 }, 'pass-limit'],
    [{ budgetMs: 100 }, 'time-limit'],
    [{ maxPasses: 15 }, 'pass-limit'],
  ]) {
    const value = fixture({ loading: true });
    const result = await run(value, options);
    assert.equal(result.coverage.reason, reason);
    assert.equal(result.coverage.endObserved, false);
    assert.equal(result.restored, true);
    assert.ok(result.rows.length <= (options.limit ?? 2));
    assert.ok(value.reads() <= (options.maxPasses ?? 100));
  }
});

test('owner input after a read stops admission and prevents scroll restoration', async () => {
  const value = fixture({ hook: ({ change }) => change('owner-active') });
  const result = await run(value);
  assert.equal(result.coverage.reason, 'owner-active');
  assert.deepEqual(result.rows, []);
  assert.deepEqual(value.releases, [false]);
  assert.equal(value.moved(), 0);
});

test('navigation refuses later reads and releases without restoring the old owner', async () => {
  const value = fixture({ hook: ({ change }) => change('navigate') });
  const result = await run(value);
  assert.equal(result.coverage.reason, 'document-changed');
  assert.deepEqual(result.rows, []);
  assert.deepEqual(value.releases, [false]);
});

test('cancellation during settling causes no later read or movement', async () => {
  const controller = new AbortController();
  const value = fixture();
  const result = await run(
    value,
    { signal: controller.signal },
    { pause: async () => controller.abort() }
  );
  assert.equal(result.coverage.reason, 'cancelled');
  assert.equal(value.reads(), 0);
  assert.equal(value.moved(), 0);
  assert.equal(result.restored, true);
});

test('unavailable or busy list ownership never reports a completed empty scan', async () => {
  for (const status of ['unavailable', 'busy', 'changed']) {
    const value = fixture({ hook: ({ change }) => change(status) });
    const result = await run(value);
    assert.equal(result.coverage.reason, status);
    assert.equal(result.coverage.complete, false);
    assert.equal(result.coverage.endObserved, false);
    assert.equal(result.restored, false);
  }
});
